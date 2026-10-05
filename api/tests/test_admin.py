"""`/api/admin/*` against a real Postgres: the queue, publishing, editing, deleting.

These are the transitions the site's whole purpose rests on — a write-up nobody has read must not be
on Explore, a published one must be, and renaming one must not break a link somebody already put in
an email. All of that lives in `queries/admin.py`, so it cannot be tested honestly without a
database; with no reachable `DATABASE_URL` the module skips.

Only rows created here are removed. Run: cd api && uv run pytest
"""

from __future__ import annotations

from datetime import date

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg.rows import dict_row

from app import uploads
from app.config import get_settings
from app.main import app

from .helpers import ADMIN_SECRET, admin_headers, read_fixture, requires_db

pytestmark = requires_db

EMAIL = "phase4admin@colby.edu"


def sql(query: str, params=()):
    """Independent sync connection: the app owns the async pool (and its event loop)."""
    with psycopg.connect(
        get_settings().database_url, autocommit=True, row_factory=dict_row
    ) as conn:
        with conn.cursor() as cursor:
            cursor.execute(query, params)
            return cursor.fetchall() if cursor.description else None


def make_submitter(email: str) -> int:
    rows = sql(
        """
        INSERT INTO submitters (email, first_name, last_name, departments)
        VALUES (%s, 'Phase', 'Four', '{}')
        ON CONFLICT (email) DO UPDATE SET updated_at = now()
        RETURNING id
        """,
        (email,),
    )
    return rows[0]["id"]


def make_project(
    *,
    status: str = "pending",
    title: str = "Renaming scanned syllabi",
    slug: str,
    source_path: str | None = None,
    days_ago: int = 3,
) -> int:
    rows = sql(
        """
        INSERT INTO projects (slug, title, body_markdown, department, submitter_id, status,
                              source_filename, source_path, created_at, updated_at)
        VALUES (%s, %s, '## Run it', 'Library', %s, %s, 'write-up.docx', %s,
                now() - make_interval(days => %s), now() - make_interval(days => %s))
        RETURNING id
        """,
        (slug, title, make_submitter(EMAIL), status, source_path, days_ago, days_ago),
    )
    return rows[0]["id"]


def purge() -> None:
    sql(
        """
        DELETE FROM projects WHERE submitter_id IN
            (SELECT id FROM submitters WHERE email = %s)
        """,
        (EMAIL,),
    )
    sql("DELETE FROM submitters WHERE email = %s", (EMAIL,))


def ids(rows) -> list[int]:
    return [row["id"] for row in rows]


@pytest.fixture(autouse=True)
def clean_database():
    purge()
    yield
    purge()


@pytest.fixture
def client(tmp_path, monkeypatch):
    """A client whose `SESSION_SECRET` is the test secret, whatever the developer's .env says.

    The environment is patched rather than the settings object because the whole app reads that one
    cached snapshot — the dependency that decides, and the limits the editor obeys.
    """
    monkeypatch.setenv("SESSION_SECRET", ADMIN_SECRET)
    get_settings.cache_clear()
    monkeypatch.setattr(uploads, "_upload_store", uploads.UploadStore(tmp_path))
    with TestClient(app) as test_client:
        yield test_client
    get_settings.cache_clear()


@pytest.fixture
def pending():
    """One write-up in the queue, and its id."""
    return make_project(slug="renaming-scanned-syllabi-2026-01-01-a1b1", title="Renaming syllabi")


# --- who is allowed in -----------------------------------------------------------------------


def test_the_admin_api_refuses_anything_without_a_current_token(client, pending):
    assert client.get("/api/admin/projects").status_code == 401
    assert client.get("/api/admin/projects", headers={"Authorization": "Bearer"}).status_code == 401
    assert (
        client.get("/api/admin/projects", headers=admin_headers(secret="not-our-secret")).status_code
        == 401
    )
    assert client.get(f"/api/admin/projects/{pending}").status_code == 401
    assert client.delete(f"/api/admin/projects/{pending}").status_code == 401
    assert client.post("/api/admin/preview", json={"markdown": "# hi"}).status_code == 401

    # ...and the write really did not happen.
    assert sql("SELECT status FROM projects WHERE id = %s", (pending,))[0]["status"] == "pending"


def test_a_signed_in_admin_sees_the_queue(client, pending):
    response = client.get("/api/admin/projects?status=pending", headers=admin_headers())
    assert response.status_code == 200
    mine = [row for row in response.json() if row["id"] == pending]
    assert len(mine) == 1
    # The email is the point of the admin listing: it is how an admin answers a write-up.
    assert mine[0]["submitter"]["email"] == EMAIL
    assert mine[0]["status"] == "pending"
    assert "body_markdown" not in mine[0], "the list is metadata only; the editor fetches the body"


def test_an_unknown_status_filter_is_answered_in_words(client):
    response = client.get("/api/admin/projects?status=approved", headers=admin_headers())
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], str)


def test_the_filter_selects_the_status_and_pending_is_oldest_first(client):
    oldest = make_project(slug="queue-oldest-2026-01-01-aaaa", status="pending", days_ago=9)
    middle = make_project(slug="queue-middle-2026-01-02-bbbb", status="pending", days_ago=4)
    live = make_project(slug="queue-live-2026-01-03-cccc", status="published", days_ago=1)
    gone = make_project(slug="queue-gone-2026-01-04-dddd", status="rejected", days_ago=2)

    def listing(status: str | None = None):
        url = "/api/admin/projects" if status is None else f"/api/admin/projects?status={status}"
        return client.get(url, headers=admin_headers()).json()

    assert {oldest, middle, live, gone} <= set(ids(listing()))

    queue = [value for value in ids(listing("pending")) if value in {oldest, middle}]
    assert queue == [oldest, middle], "a queue is worked oldest first, not newest first"

    assert ids(listing("published")).count(live) == 1
    assert gone not in set(ids(listing("published")))
    assert live not in set(ids(listing("pending")))


# --- publishing ------------------------------------------------------------------------------


def test_publishing_is_what_puts_a_writeup_on_explore(client, pending):
    slug = sql("SELECT slug FROM projects WHERE id = %s", (pending,))[0]["slug"]
    assert client.get(f"/api/projects/{slug}").status_code == 404

    response = client.post(
        f"/api/admin/projects/{pending}/status", json={"status": "published"}, headers=admin_headers()
    )
    assert response.status_code == 200
    assert response.json()["status"] == "published"

    assert slug in {row["slug"] for row in client.get("/api/projects").json()}
    assert client.get(f"/api/projects/{slug}").status_code == 200


def test_rejecting_and_reopening_are_both_available(client, pending):
    slug = sql("SELECT slug FROM projects WHERE id = %s", (pending,))[0]["slug"]
    client.post(
        f"/api/admin/projects/{pending}/status", json={"status": "published"}, headers=admin_headers()
    )

    client.post(
        f"/api/admin/projects/{pending}/status", json={"status": "rejected"}, headers=admin_headers()
    )
    assert client.get(f"/api/projects/{slug}").status_code == 404
    assert (
        sql("SELECT status FROM projects WHERE id = %s", (pending,))[0]["status"] == "rejected"
    )

    client.post(
        f"/api/admin/projects/{pending}/status", json={"status": "pending"}, headers=admin_headers()
    )
    assert sql("SELECT status FROM projects WHERE id = %s", (pending,))[0]["status"] == "pending"


def test_the_status_vocabulary_is_the_one_vocabulary(client, pending):
    """`approved` is retired (locked decision #14) — the API will not speak it, even by accident."""
    for status in ("approved", "draft", "Published", ""):
        response = client.post(
            f"/api/admin/projects/{pending}/status", json={"status": status}, headers=admin_headers()
        )
        assert response.status_code == 422, status
        assert response.json()["detail"].strip(), "an answer the dashboard can print"
    assert sql("SELECT status FROM projects WHERE id = %s", (pending,))[0]["status"] == "pending"


# --- editing ---------------------------------------------------------------------------------


def test_editing_the_title_leaves_the_slug_alone(client, pending):
    """Locked decision #4, the one an admin is most likely to trip over."""
    before = sql("SELECT slug, body_markdown, department FROM projects WHERE id = %s", (pending,))[0]

    response = client.patch(
        f"/api/admin/projects/{pending}",
        json={"title": "Renaming 400 scanned syllabi without hand-typing"},
        headers=admin_headers(),
    )
    assert response.status_code == 200
    edited = response.json()

    assert edited["title"] == "Renaming 400 scanned syllabi without hand-typing"
    assert edited["slug"] == before["slug"], "a title edit must never move a published URL"
    assert edited["body_markdown"] == before["body_markdown"], "absent fields are left alone"
    assert edited["department"] == before["department"]

    assert sql("SELECT slug FROM projects WHERE id = %s", (pending,))[0]["slug"] == before["slug"]


def test_the_web_address_moves_only_when_it_is_asked_for(client, pending):
    response = client.patch(
        f"/api/admin/projects/{pending}",
        json={"slug": "Renamed Syllabi 2026"},
        headers=admin_headers(),
    )
    assert response.status_code == 200
    assert response.json()["slug"] == "renamed-syllabi-2026"

    taken = sql("SELECT slug FROM projects WHERE id = %s", (pending,))[0]["slug"]
    other = make_project(slug="already-taken-2026-01-01-eeee", status="published")

    clash = client.patch(
        f"/api/admin/projects/{other}", json={"slug": taken}, headers=admin_headers()
    )
    assert clash.status_code == 409
    assert "web address" in clash.json()["detail"]
    assert sql("SELECT slug FROM projects WHERE id = %s", (other,))[0]["slug"] == (
        "already-taken-2026-01-01-eeee"
    )

    # An admin may hand something else to a project that a published one already owns the stem of:
    # the suffix belongs to the row, not to the slugifier.
    nearby = client.patch(
        f"/api/admin/projects/{other}", json={"slug": "already-taken"}, headers=admin_headers()
    )
    assert nearby.status_code == 200
    assert nearby.json()["slug"] == "already-taken"

    rubbish = client.patch(
        f"/api/admin/projects/{pending}", json={"slug": "   "}, headers=admin_headers()
    )
    assert rubbish.status_code == 422
    assert rubbish.json()["detail"].strip()


def test_an_edited_body_is_stored_as_markdown_and_rendered_safely(client, pending):
    draft = "# Now with headings\n\n<script>alert(1)</script>\n\nSee [the roster](https://colby.edu)."
    response = client.patch(
        f"/api/admin/projects/{pending}", json={"body_markdown": draft}, headers=admin_headers()
    )
    assert response.status_code == 200
    detail = response.json()

    assert detail["body_markdown"].startswith("# Now with headings")
    assert "<script" not in detail["body_html"]
    assert "alert(1)" in detail["body_markdown"], "the Markdown is what the admin typed"
    assert 'rel="noopener noreferrer nofollow"' in detail["body_html"]

    # ...and the reader sees the same sanitized thing.
    client.post(
        f"/api/admin/projects/{pending}/status", json={"status": "published"}, headers=admin_headers()
    )
    slug = sql("SELECT slug FROM projects WHERE id = %s", (pending,))[0]["slug"]
    assert "<script" not in client.get(f"/api/projects/{slug}").json()["body_html"]


def test_the_preview_endpoint_renders_a_draft_it_never_stored(client, pending):
    response = client.post(
        "/api/admin/preview",
        json={"markdown": "## Preview\n\n- one\n- two\n<img src=x onerror=alert(1)>"},
        headers=admin_headers(),
    )
    assert response.status_code == 200
    html = response.json()["body_html"]
    assert "<h2>Preview</h2>" in html
    assert html.count("<li>") == 2
    # The <img> never becomes a tag: markdown-it escapes the raw HTML and bleach would have dropped
    # it anyway. What survives is the administrator's own text, visibly inert.
    assert "<img" not in html
    assert "&lt;img" in html

    assert (
        sql("SELECT body_markdown FROM projects WHERE id = %s", (pending,))[0]["body_markdown"]
        == "## Run it"
    )


def test_an_empty_edit_changes_nothing(client, pending):
    before = sql("SELECT title, updated_at FROM projects WHERE id = %s", (pending,))[0]
    response = client.patch(f"/api/admin/projects/{pending}", json={}, headers=admin_headers())
    assert response.status_code == 200
    after = sql("SELECT title, updated_at FROM projects WHERE id = %s", (pending,))[0]
    assert after == before


def test_bad_edits_are_sentences_and_nothing_is_written(client, pending):
    before = sql("SELECT title FROM projects WHERE id = %s", (pending,))[0]

    for body in ({"title": "   "}, {"title": "x" * 300}, {"department": ""}, {"title": "abc"}):
        response = client.patch(
            f"/api/admin/projects/{pending}", json=body, headers=admin_headers()
        )
        assert response.status_code == 422, body
        assert isinstance(response.json()["detail"], str)

    assert sql("SELECT title FROM projects WHERE id = %s", (pending,))[0] == before


# --- deleting --------------------------------------------------------------------------------


def test_deleting_takes_the_row_and_the_original_file_with_it(client, tmp_path):
    store = uploads.get_upload_store()
    key = store.save(
        original_filename="write-up.docx",
        created_on=date(2026, 1, 1),
        data=read_fixture("writeup.docx"),
    )
    project = make_project(slug="delete-me-2026-01-01-ffff", source_path=key)

    response = client.delete(f"/api/admin/projects/{project}", headers=admin_headers())
    assert response.status_code == 204
    assert response.content == b""

    assert sql("SELECT count(*) AS n FROM projects WHERE id = %s", (project,))[0]["n"] == 0
    assert not (store.root / key).exists(), "the .docx should not outlive its project"

    again = client.delete(f"/api/admin/projects/{project}", headers=admin_headers())
    assert again.status_code == 404


def test_an_unknown_project_id_is_a_four_zero_four(client):
    headers = admin_headers()
    missing = 999_999_999
    assert client.get(f"/api/admin/projects/{missing}", headers=headers).status_code == 404
    assert (
        client.patch(f"/api/admin/projects/{missing}", json={"title": "Nobody"}, headers=headers)
    ).status_code == 404
    assert (
        client.post(
            f"/api/admin/projects/{missing}/status",
            json={"status": "published"},
            headers=headers,
        )
    ).status_code == 404
    assert client.delete(f"/api/admin/projects/{missing}", headers=headers).status_code == 404


def test_the_editor_gets_the_body_the_dashboard_did_not_send(client, pending):
    response = client.get(f"/api/admin/projects/{pending}", headers=admin_headers())
    assert response.status_code == 200
    detail = response.json()
    assert detail["body_markdown"] == "## Run it"
    assert detail["body_html"] == "<h2>Run it</h2>\n"
    assert detail["source_filename"] == "write-up.docx"
    assert detail["submitter"]["email"] == EMAIL

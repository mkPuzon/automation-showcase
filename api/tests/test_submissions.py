"""`POST /api/submissions` against a real Postgres.

A submission writes two tables inside one transaction, so this is the one part of the API that
cannot be tested honestly without a database. Skipped automatically when `DATABASE_URL` does not
answer. Only rows created here are removed — it never truncates anything.

Run: cd api && uv run pytest
"""

from __future__ import annotations

import re

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg.rows import dict_row

from app import uploads
from app.config import get_settings
from app.main import app

from .helpers import read_fixture, requires_db

pytestmark = requires_db

# Letters-only local part on purpose: `CONVENTIONAL_LOCAL_PART` would otherwise raise the soft
# warning and every happy-path assertion about `warning is None` would be about the wrong thing.
TEST_EMAIL = "phasefixture@colby.edu"
OWNER_EMAIL = "phaseslugowner@colby.edu"
ODD_EMAIL = "p-fixture24@colby.edu"

DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

FIELDS = {
    "first_name": "Phase",
    "last_name": "Fixture",
    "email": TEST_EMAIL,
    "department": "Computational Science",
    "title": "Grading 120 lab reports with a rubric macro",
    "technologies": ["Python", "Google Docs"],
    "contributors": ["Karen Vreeland"],
}


def tmp_files() -> list[str]:
    """Keys of the files currently on the uploads volume."""
    store = uploads.get_upload_store()
    return sorted(
        str(path.relative_to(store.root)) for path in store.root.rglob("*") if path.is_file()
    )


def writeup() -> bytes:
    return read_fixture("writeup.docx")


def submit(client, *, fields=None, filename="writeup.docx", content_type=DOCX_TYPE, blob=None):
    return client.post(
        "/api/submissions",
        data=fields if fields is not None else FIELDS,
        files={"document": (filename, writeup() if blob is None else blob, content_type)},
    )


def sql(query: str, params=()):
    """Independent sync connection: the app owns the async pool (and its event loop)."""
    with psycopg.connect(get_settings().database_url, autocommit=True, row_factory=dict_row) as conn:
        with conn.cursor() as cursor:
            cursor.execute(query, params)
            return cursor.fetchall() if cursor.description else None


def purge() -> None:
    emails = (TEST_EMAIL, OWNER_EMAIL, ODD_EMAIL)
    sql(
        """
        DELETE FROM projects WHERE submitter_id IN
            (SELECT id FROM submitters WHERE email = ANY(%s))
        """,
        (list(emails),),
    )
    sql("DELETE FROM submitters WHERE email = ANY(%s)", (list(emails),))


@pytest.fixture(autouse=True)
def clean_database():
    purge()
    yield
    purge()


@pytest.fixture
def client(tmp_path, monkeypatch):
    # Uploads go to a throwaway directory we can inspect for leftovers.
    monkeypatch.setattr(uploads, "_upload_store", uploads.UploadStore(tmp_path))
    with TestClient(app) as test_client:
        yield test_client


def test_a_writeup_lands_as_a_pending_project(client):
    response = submit(client)
    assert response.status_code == 201, response.text
    body = response.json()

    assert body["status"] == "pending"
    assert body["title"] == FIELDS["title"]
    assert body["warning"] is None
    # <title-slug>-<YYYY-MM-DD>-<short-id>
    assert re.fullmatch(
        r"grading-120-lab-reports-with-a-rubric-macro-20\d\d-\d\d-\d\d-[0-9a-f]{4}", body["slug"]
    ), body["slug"]

    rows = sql(
        """
        SELECT p.slug, p.status, p.department, p.technologies, p.contributors,
               p.body_markdown, p.source_filename, p.source_path,
               s.email, s.first_name, s.last_name, s.departments
        FROM projects p JOIN submitters s ON s.id = p.submitter_id
        WHERE s.email = %s
        """,
        (TEST_EMAIL,),
    )
    assert len(rows) == 1
    project = rows[0]
    assert project["status"] == "pending"
    assert project["slug"] == body["slug"]
    assert project["technologies"] == ["Python", "Google Docs"]
    assert project["contributors"] == ["Karen Vreeland"]
    assert project["source_filename"] == "writeup.docx"
    assert project["body_markdown"].startswith("# Cleaning Up Watershed Sensor Exports")
    assert "<img" not in project["body_markdown"].split("Gotchas")[0]
    assert project["email"] == TEST_EMAIL
    assert project["departments"] == ["Computational Science"]

    # the original file is on the volume, under a key we generated (not the client's filename)
    assert tmp_files() == [project["source_path"]]


def test_pending_submissions_are_not_public(client):
    slug = submit(client).json()["slug"]
    published = client.get("/api/projects").json()
    assert slug not in {project["slug"] for project in published}
    assert client.get(f"/api/projects/{slug}").status_code == 404


def test_a_repeat_submitter_keeps_one_row_and_gains_departments(client):
    submit(client)
    second = dict(FIELDS, department="Digital Learning", title="Batch renaming scanned syllabi")
    assert submit(client, fields=second).status_code == 201

    rows = sql(
        "SELECT first_name, last_name, departments, (SELECT count(*) FROM projects p WHERE p.submitter_id = submitters.id) AS projects FROM submitters WHERE email = %s",
        (TEST_EMAIL,),
    )
    assert len(rows) == 1
    assert rows[0]["departments"] == ["Computational Science", "Digital Learning"]
    assert rows[0]["projects"] == 2


def test_an_odd_but_valid_email_still_submits_with_a_warning(client):
    body = submit(client, fields=dict(FIELDS, email=ODD_EMAIL)).json()
    assert body["warning"]
    assert sql("SELECT count(*) AS n FROM submitters WHERE email = %s", (ODD_EMAIL,))[0]["n"] == 1


def test_a_request_with_no_document_is_answered_in_words(client):
    """FastAPI's own 422 body is a list of pydantic errors; SvelteKit shows `detail` verbatim."""
    response = client.post("/api/submissions", data=FIELDS)
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert isinstance(detail, str)
    assert ".docx" in detail


@pytest.mark.parametrize(
    "overrides, fragment",
    [
        ({"email": "phase3@gmail.com"}, "colby.edu"),
        ({"first_name": ""}, "First name"),
        ({"department": ""}, "Department"),
        ({"title": "abc"}, "title"),
    ],
)
def test_bad_metadata_is_rejected_and_nothing_is_written(client, overrides, fragment):
    response = submit(client, fields={**FIELDS, **overrides})
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert isinstance(detail, str), "a rejected submission must answer with a sentence, not a list"
    assert fragment.lower() in detail.lower()
    assert sql("SELECT count(*) AS n FROM submitters WHERE email = %s", (TEST_EMAIL,))[0]["n"] == 0


def test_non_docx_uploads_are_refused(client):
    response = submit(client, filename="notes.txt")
    assert response.status_code == 422
    assert ".docx" in response.json()["detail"]

    response = submit(client, content_type="text/plain")
    assert response.status_code == 415

    # wrong type *and* a filename that would otherwise pass
    response = submit(client, blob=b"PK\x03\x04 not really a docx")
    assert response.status_code == 422
    assert sql("SELECT count(*) AS n FROM submitters WHERE email = %s", (TEST_EMAIL,))[0]["n"] == 0


def test_oversized_uploads_are_refused(client):
    limit = get_settings().max_upload_bytes
    response = submit(client, blob=b"\x00" * (limit + 1))
    assert response.status_code == 413
    assert "MB" in response.json()["detail"]
    assert tmp_files() == []


def test_the_honeypot_field_is_rejected_quietly(client):
    response = submit(client, fields={**FIELDS, "company": "SEO Services Ltd"})
    assert response.status_code == 422
    assert "company" not in response.json()["detail"].lower()
    assert sql("SELECT count(*) AS n FROM submitters WHERE email = %s", (TEST_EMAIL,))[0]["n"] == 0


def test_the_transaction_rolls_back_when_the_project_insert_fails(client, monkeypatch, tmp_path):
    """The submitter upsert happens first; if the project insert fails, it must not survive."""
    slug = "colliding-title-2026-01-01-eeee"
    owner_id = sql(
        "INSERT INTO submitters (email, first_name, last_name) VALUES (%s, 'Slug', 'Owner') RETURNING id",
        (OWNER_EMAIL,),
    )[0]["id"]
    sql(
        """
        INSERT INTO projects (slug, title, department, submitter_id, status)
        VALUES (%s, 'Colliding title', 'Library', %s, 'published')
        """,
        (slug, owner_id),
    )
    projects_before = sql("SELECT count(*) AS n FROM projects")[0]["n"]

    # Force every attempt at the slug to clash, so the insert fails after the upsert succeeded.
    monkeypatch.setattr("app.queries.submissions.build_slug", lambda *_args, **_kwargs: slug)

    response = submit(client)
    assert response.status_code == 503
    assert "web address" in response.json()["detail"]

    assert sql("SELECT count(*) AS n FROM projects")[0]["n"] == projects_before
    assert (
        sql("SELECT count(*) AS n FROM submitters WHERE email = %s", (TEST_EMAIL,))[0]["n"] == 0
    ), "the submitter row from the rolled-back transaction survived"
    assert tmp_files() == [], "the .docx should be deleted when its transaction fails"

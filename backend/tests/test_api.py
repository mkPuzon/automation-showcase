from fastapi.testclient import TestClient

from .conftest import admin_login, project_payload


def test_admin_login_uses_admin_password_environment_variable(client: TestClient, monkeypatch) -> None:
    monkeypatch.setenv("ADMIN_PASSWORD", "password-from-env")

    response = client.post("/api/admin/login", params={"password": "password-from-env"})

    assert response.status_code == 200


def test_health_checks_database(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_valid_submission_is_pending_and_preserves_markdown(client: TestClient) -> None:
    source = "# Keep this source\n\n<script>alert('xss')</script>\n\n**bold**"
    response = client.post("/api/projects", json=project_payload(description_markdown=source))

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "pending"
    assert body["description_markdown"] == source
    assert "<script>" not in body["description_html"]
    assert "<strong>bold</strong>" in body["description_html"]


def test_missing_and_invalid_submission_fields_are_rejected(client: TestClient) -> None:
    missing = client.post("/api/projects", json={})
    invalid_email = client.post(
        "/api/projects",
        json=project_payload(submitter_email="person@example.com"),
    )
    empty_values = client.post(
        "/api/projects",
        json=project_payload(contributors=[" "] , tools=["Zapier"]),
    )

    assert missing.status_code == 422
    assert invalid_email.status_code == 422
    assert empty_values.status_code == 422


def test_public_endpoints_exclude_pending_and_rejected_projects(client: TestClient) -> None:
    pending = client.post("/api/projects", json=project_payload(title="Pending project")).json()
    rejected = client.post("/api/projects", json=project_payload(title="Rejected project")).json()
    admin_login(client)
    client.patch(f"/api/admin/projects/{rejected['id']}", json={"status": "rejected"})

    listing = client.get("/api/projects")
    assert listing.status_code == 200
    assert listing.json() == []
    assert client.get(f"/api/projects/{pending['detail_slug']}").status_code == 404
    assert client.get(f"/api/projects/{rejected['detail_slug']}").status_code == 404


def test_admin_list_requires_authorization(client: TestClient) -> None:
    response = client.get("/api/admin/projects")

    assert response.status_code == 401


def test_admin_can_approve_submission(client: TestClient) -> None:
    created = client.post("/api/projects", json=project_payload()).json()
    admin_login(client)

    response = client.patch(f"/api/admin/projects/{created['id']}", json={"status": "approved"})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "approved"
    assert body["reviewed_at"] is not None
    assert body["reviewed_by"] == "admin"
    assert client.get("/api/projects").json()[0]["id"] == created["id"]


def test_admin_can_reject_submission(client: TestClient) -> None:
    created = client.post("/api/projects", json=project_payload()).json()
    admin_login(client)

    response = client.patch(
        f"/api/admin/projects/{created['id']}",
        json={"status": "rejected", "rejection_reason": "Needs more detail"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "rejected"
    assert response.json()["rejection_reason"] == "Needs more detail"
    assert client.get("/api/projects").json() == []


def test_unauthorized_moderation_changes_are_rejected(client: TestClient) -> None:
    created = client.post("/api/projects", json=project_payload()).json()

    response = client.patch(f"/api/admin/projects/{created['id']}", json={"status": "approved"})

    assert response.status_code == 401
    assert client.get("/api/projects").json() == []


def test_missing_project_ids_return_not_found(client: TestClient) -> None:
    admin_login(client)

    response = client.patch("/api/admin/projects/9999", json={"status": "approved"})

    assert response.status_code == 404
    assert client.get("/api/projects/not-a-real-project").status_code == 404


def test_repeated_moderation_actions_are_safe_and_idempotent(client: TestClient) -> None:
    created = client.post("/api/projects", json=project_payload()).json()
    admin_login(client)

    first = client.patch(f"/api/admin/projects/{created['id']}", json={"status": "approved"})
    second = client.patch(f"/api/admin/projects/{created['id']}", json={"status": "approved"})

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["status"] == "approved"
    assert len(client.get("/api/projects").json()) == 1


def test_options_are_database_backed(client: TestClient) -> None:
    client.post(
        "/api/projects",
        json=project_payload(
            contributors=["Zoe", "Contributor Name"],
            tools=["Tool Name", "New Tool"],
            department="Library",
        ),
    )

    response = client.get("/api/options")

    assert response.status_code == 200
    assert response.json() == {
        "contributors": ["Contributor Name", "Zoe"],
        "tools": ["New Tool", "Tool Name"],
        "departments": ["Library"],
    }

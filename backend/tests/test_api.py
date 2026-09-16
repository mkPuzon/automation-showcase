from types import SimpleNamespace

from fastapi.testclient import TestClient

from app import main
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


def test_markdown_preview_renders_safely(client: TestClient) -> None:
    response = client.post(
        "/api/markdown/preview",
        json={"source": "- First\n- Second\n\n<script>alert('xss')</script>"},
    )

    assert response.status_code == 200
    assert "<li>First</li>" in response.json()["html"]
    assert "<li>Second</li>" in response.json()["html"]
    assert "<script>" not in response.json()["html"]


def test_pdf_upload_converts_basic_layout_to_editable_markdown(client: TestClient, monkeypatch) -> None:
    class FakePage:
        def extract_text(self, extraction_mode: str = "") -> str:
            assert extraction_mode == "layout"
            return "AUTOMATION GUIDE\n\n• First step\n• Second step"

    monkeypatch.setattr(
        main,
        "PdfReader",
        lambda _: SimpleNamespace(is_encrypted=False, pages=[FakePage()]),
    )

    response = client.post(
        "/api/markdown/from-pdf",
        files={"file": ("guide.pdf", b"%PDF-1.7 test", "application/pdf")},
    )

    assert response.status_code == 200
    assert response.json()["description_markdown"] == "# Automation Guide\n\n- First step\n- Second step"


def test_pdf_parser_rejoins_wrapped_prose_without_overheading() -> None:
    source = main.pdf_text_to_markdown(
        "AUTOMATION GUIDE\n\nThis is a normal paragraph that was wrapped at the\npage boundary and should remain one readable paragraph.\n\nNEXT STEPS\n\n1. Review the workflow.\n2. Share the result."
    )

    assert source == (
        "# Automation Guide\n\n"
        "This is a normal paragraph that was wrapped at the page boundary and should remain one readable paragraph.\n\n"
        "## Next Steps\n\n"
        "1. Review the workflow.\n2. Share the result."
    )


def test_pdf_parser_keeps_numbered_items_in_one_ordered_list() -> None:
    source = main.pdf_text_to_markdown("1. First step\n\n2. Second step\n\n3. Final step")

    assert source == "1. First step\n2. Second step\n3. Final step"


def test_image_upload_requires_valid_draft_token(client: TestClient) -> None:
    response = client.post(
        "/api/uploads",
        params={"draft_token": "too-short"},
        files={"file": ("diagram.png", b"not-an-image", "image/png")},
    )

    assert response.status_code == 400
    assert "draft token" in response.json()["detail"]


def test_image_upload_stores_safe_png_and_attaches_on_submission(client: TestClient, tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(main, "UPLOADS_DIR", tmp_path)
    token = "draft_" + "a" * 26
    png = b"\x89PNG\r\n\x1a\nvalid image bytes"

    uploaded = client.post(
        "/api/uploads",
        params={"draft_token": token},
        files={"file": ("workflow.png", png, "image/png")},
    )
    assert uploaded.status_code == 201
    body = uploaded.json()
    assert body["markdown"].startswith("![workflow.png](http://localhost:8000/api/uploads/")
    assert list(tmp_path.iterdir())[0].suffix == ".png"

    created = client.post(
        "/api/projects",
        json=project_payload(description_markdown=f"## Story\n\n{body['markdown']}", draft_token=token),
    ).json()
    assert body["markdown"] in created["description_markdown"]

    admin_login(client)
    client.patch(f"/api/admin/projects/{created['id']}", json={"status": "approved"})
    image_response = client.get(body["url"])
    assert image_response.status_code == 200


def test_image_upload_rejects_bad_extension_and_unauthorized_admin_upload(client: TestClient) -> None:
    token = "draft_" + "b" * 26
    response = client.post(
        "/api/uploads",
        params={"draft_token": token},
        files={"file": ("workflow.gif", b"GIF89a", "image/gif")},
    )
    assert response.status_code == 400

    created = client.post("/api/projects", json=project_payload()).json()
    response = client.post(
        f"/api/admin/projects/{created['id']}/images",
        files={"file": ("workflow.jpg", b"bad", "image/jpeg")},
    )
    assert response.status_code == 401


def test_deleted_project_removes_attached_images(client: TestClient, tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(main, "UPLOADS_DIR", tmp_path)
    admin_login(client)
    created = client.post("/api/projects", json=project_payload()).json()
    uploaded = client.post(
        f"/api/admin/projects/{created['id']}/images",
        files={"file": ("workflow.jpg", b"\xff\xd8\xffimage\xff\xd9", "image/jpeg")},
    )
    assert uploaded.status_code == 201
    filename = next(tmp_path.iterdir())
    assert filename.exists()

    assert client.delete(f"/api/admin/projects/{created['id']}").status_code == 204
    assert not filename.exists()


def test_pdf_upload_rejects_non_pdf_files(client: TestClient) -> None:
    response = client.post(
        "/api/markdown/from-pdf",
        files={"file": ("guide.txt", b"plain text", "text/plain")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Upload a PDF file."


def test_pdf_upload_rejects_image_only_documents(client: TestClient, monkeypatch) -> None:
    class EmptyPage:
        def extract_text(self, extraction_mode: str = "") -> str:
            return ""

    monkeypatch.setattr(
        main,
        "PdfReader",
        lambda _: SimpleNamespace(is_encrypted=False, pages=[EmptyPage()]),
    )

    response = client.post(
        "/api/markdown/from-pdf",
        files={"file": ("scanned.pdf", b"%PDF-1.7 test", "application/pdf")},
    )

    assert response.status_code == 422
    assert "selectable text" in response.json()["detail"]


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


def test_admin_queue_puts_pending_projects_first(client: TestClient) -> None:
    approved = client.post("/api/projects", json=project_payload(title="Approved project")).json()
    client.post("/api/projects", json=project_payload(title="Pending project"))
    admin_login(client)
    client.patch(f"/api/admin/projects/{approved['id']}", json={"status": "approved"})

    response = client.get("/api/admin/projects")

    assert response.status_code == 200
    assert response.json()[0]["status"] == "pending"


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


def test_admin_can_delete_project(client: TestClient) -> None:
    created = client.post("/api/projects", json=project_payload()).json()
    admin_login(client)

    response = client.delete(f"/api/admin/projects/{created['id']}")

    assert response.status_code == 204
    assert response.content == b""
    assert client.get("/api/admin/projects").json() == []
    assert client.delete(f"/api/admin/projects/{created['id']}").status_code == 404


def test_project_deletion_requires_admin(client: TestClient) -> None:
    created = client.post("/api/projects", json=project_payload()).json()

    response = client.delete(f"/api/admin/projects/{created['id']}")

    assert response.status_code == 401
    admin_login(client)
    assert client.get("/api/admin/projects").json()[0]["id"] == created["id"]


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

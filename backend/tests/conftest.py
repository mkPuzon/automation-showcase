import os

os.environ["ADMIN_PASSWORD"] = "test-admin"
os.environ["SEED_LOCAL"] = "false"
os.environ["DATABASE_URL"] = "sqlite://"

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import main


@pytest.fixture()
def client() -> Iterator[TestClient]:
    """Provide an isolated in-memory database for each API test."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    main.engine = engine
    main.SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    main.Base.metadata.create_all(engine)

    with TestClient(main.app) as test_client:
        yield test_client

    main.Base.metadata.drop_all(engine)
    engine.dispose()


def project_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "title": "A useful automation project",
        "description_markdown": "## What it does\n\nA helpful workflow.",
        "contributors": ["Contributor Name"],
        "tools": ["Tool Name"],
        "department": "Academic Affairs",
        "submitter_email": "name@colby.edu",
    }
    payload.update(overrides)
    return payload


def admin_login(client: TestClient) -> None:
    response = client.post("/api/admin/login", params={"password": "test-admin"})
    assert response.status_code == 200
    assert response.json() == {"status": "authenticated"}

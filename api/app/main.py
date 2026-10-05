"""FastAPI app: runs plain-SQL migrations at startup, then serves the API."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import psycopg
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from psycopg.rows import dict_row

from . import db
from .config import get_settings
from .migrations import run_migrations
from .routers import admin, projects, submissions

API_VERSION = "0.1.0"

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("techshare.api")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    try:
        async with await psycopg.AsyncConnection.connect(
            settings.database_url, row_factory=dict_row, autocommit=True
        ) as conn:
            applied = await run_migrations(conn, settings.migrations_dir)
    except psycopg.Error as exc:
        # Never log the DSN: it carries the password.
        raise RuntimeError(
            f"migrations failed ({exc.__class__.__name__}: {exc}). "
            "Is Postgres up? Try: docker compose -f compose.local.yml up db"
        ) from exc
    if applied:
        log.info("migrations applied: %s", ", ".join(applied))
    await db.startup()
    log.info("database pool ready")
    try:
        yield
    finally:
        await db.shutdown()


app = FastAPI(
    title="Colby Tech Share Forum API",
    version=API_VERSION,
    description="Owns .docx parsing, sanitization, and project storage. Internal only.",
    lifespan=lifespan,
)
app.include_router(projects.router)
app.include_router(submissions.router)
# Every route on this router checks its own bearer token (app/auth.py); the port itself stays
# unpublished, so only SvelteKit server code can reach it at all.
app.include_router(admin.router)


@app.get("/", include_in_schema=False)
async def index() -> dict[str, str]:
    return {"name": "techshare-api", "version": API_VERSION, "health": "/api/health"}


@app.get("/api/health")
async def health() -> JSONResponse:
    db_up = await db.ping()
    return JSONResponse(
        status_code=200 if db_up else 503,
        content={
            "status": "ok" if db_up else "degraded",
            "database": "up" if db_up else "down",
            "version": API_VERSION,
        },
    )


@app.exception_handler(psycopg.Error)
async def database_error(_: Request, exc: psycopg.Error) -> JSONResponse:
    log.error("database error: %s", exc)
    return JSONResponse(status_code=503, content={"detail": "database unavailable"})


# Human-readable answers for the fields a submission cannot be missing, so that every 4xx from this
# API has a `detail` that is a sentence SvelteKit can show as-is. FastAPI's default 422 body is a
# list of pydantic error dicts, which the web layer would have to guess at.
_MISSING_FIELD_MESSAGES = {
    "document": "Attach the .docx write-up before submitting.",
    "title": "The write-up needs a title.",
    "email": "Your Colby email address is required.",
    "department": "The department or unit is required.",
    "first_name": "First name is required.",
    "last_name": "Last name is required.",
    # admin JSON bodies (PATCH /api/admin/projects/{id}, POST .../status)
    "status": "Choose a status: pending, published or rejected.",
}


@app.exception_handler(RequestValidationError)
async def request_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    missing = [str(err["loc"][-1]) for err in exc.errors() if err.get("type") == "missing"]
    if missing:
        details = [_MISSING_FIELD_MESSAGES.get(name, f"{name} is required.") for name in missing]
    else:
        # Anything else pydantic objects to (a string where a list belongs, a status that is not one
        # of ours) gets one sentence rather than its error list, because the web layer prints
        # `detail` straight to a person.
        details = ["That request could not be read — check the values and try again."]
    return JSONResponse(status_code=422, content={"detail": " ".join(details)})

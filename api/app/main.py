"""FastAPI app: runs plain-SQL migrations at startup, then serves the API."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import psycopg
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from psycopg.rows import dict_row

from . import db
from .config import get_settings
from .migrations import run_migrations
from .routers import projects

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

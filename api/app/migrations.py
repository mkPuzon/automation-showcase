"""Apply pending api/migrations/*.sql files in filename order at startup."""

import logging
from pathlib import Path

from psycopg import AsyncConnection

log = logging.getLogger("techshare.migrations")

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    version    text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
)
"""


def migration_files(directory: Path) -> list[Path]:
    return sorted(directory.glob("*.sql"))


async def applied_versions(conn: AsyncConnection) -> set[str]:
    cursor = await conn.execute("SELECT version FROM schema_migrations")
    return {row["version"] for row in await cursor.fetchall()}


async def run_migrations(conn: AsyncConnection, directory: Path) -> list[str]:
    """Each pending file runs in its own transaction and is recorded in schema_migrations."""
    await conn.execute(CREATE_TABLE)
    done = await applied_versions(conn)
    applied: list[str] = []
    for path in migration_files(directory):
        version = path.stem
        if version in done:
            continue
        async with conn.transaction():
            await conn.execute(path.read_text(encoding="utf-8"))
            await conn.execute(
                "INSERT INTO schema_migrations (version) VALUES (%s)", (version,)
            )
        applied.append(version)
        log.info("applied migration %s", version)
    return applied

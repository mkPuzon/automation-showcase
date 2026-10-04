"""psycopg 3 connection pool + tiny query helpers. No ORM.

Rows come back as dicts (`dict_row`); modules in `app/queries/` map them onto the
Pydantic models in `app/models.py`.
"""

from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager
from typing import Any

from psycopg import AsyncConnection
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from .config import get_settings

Conn = AsyncConnection[dict[str, Any]]

_pool: AsyncConnectionPool[Conn] | None = None


def open_pool() -> AsyncConnectionPool[Conn]:
    global _pool
    if _pool is None:
        _pool = AsyncConnectionPool[Conn](
            conninfo=get_settings().database_url,
            kwargs={"row_factory": dict_row},
            min_size=1,
            max_size=10,
            open=False,
            name="techshare",
        )
    return _pool


async def startup() -> None:
    pool = open_pool()
    await pool.open(wait=True)
    await pool.wait(timeout=10)


async def shutdown() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def connection() -> AsyncIterator[Conn]:
    """Borrow a pooled connection; commits on clean exit, rolls back on error."""
    if _pool is None:
        raise RuntimeError("database pool is not open")
    async with _pool.connection() as conn:
        yield conn


@asynccontextmanager
async def transaction() -> AsyncIterator[Conn]:
    """One explicit transaction for multi-statement writes (e.g. a submission insert)."""
    async with connection() as conn:
        async with conn.transaction():
            yield conn


async def fetch(sql: str, params: Sequence[Any] = ()) -> list[dict[str, Any]]:
    async with connection() as conn:
        cursor = await conn.execute(sql, params)
        return await cursor.fetchall()


async def fetchrow(sql: str, params: Sequence[Any] = ()) -> dict[str, Any] | None:
    async with connection() as conn:
        cursor = await conn.execute(sql, params)
        return await cursor.fetchone()


async def fetchval(sql: str, params: Sequence[Any] = ()) -> Any:
    async with connection() as conn:
        cursor = await conn.execute(sql, params)
        row = await cursor.fetchone()
        # rows are dicts (dict_row), so take the first column's value
        return next(iter(row.values())) if row else None


async def execute(sql: str, params: Sequence[Any] = ()) -> int:
    async with connection() as conn:
        cursor = await conn.execute(sql, params)
        return cursor.rowcount


async def ping() -> bool:
    try:
        return await fetchval("SELECT 1") == 1
    except Exception:
        return False

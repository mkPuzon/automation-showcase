"""Hand-written SQL for the admin surface: the review queue, the editor, the delete.

Two rules shape this module.

* Admins see everything, including the submitter's email — that is how an admin answers a
  write-up. The public queries in `projects.py` never select it.
* A write-up's URL does not move on its own. `slug` is set only when it is in the values handed to
  `apply_edit` (locked decision #4), so editing a title can never 404 a link someone already shared.

`updated_at` is bumped by every write here and by nothing else; the queue is ordered by it, so a
project an admin just looked at moves to the top of the "everything" list.
"""

from __future__ import annotations

from typing import Any

from .. import db
from ..models import AdminProjectDetail, AdminProjectSummary, Status, StatusFilter
from ..rendering import render_markdown

# Same one-round-trip shape as queries/projects.py: the submitter rides along in the row.
_COLUMNS = """
    p.id,
    p.slug,
    p.title,
    p.department,
    p.technologies,
    p.contributors,
    p.status,
    p.created_at,
    p.updated_at,
    p.source_filename,
    p.source_path,
    jsonb_build_object(
        'id', s.id,
        'email', s.email,
        'first_name', s.first_name,
        'last_name', s.last_name,
        'departments', s.departments
    ) AS submitter
"""

_SELECT_BY_ID = f"SELECT {_COLUMNS}, p.body_markdown FROM projects p JOIN submitters s ON s.id = p.submitter_id WHERE p.id = %s"

_SELECT_SUMMARY_BY_ID = f"SELECT {_COLUMNS} FROM projects p JOIN submitters s ON s.id = p.submitter_id WHERE p.id = %s"

# Columns an admin may write, in the order they are listed in the request model. The keys are the
# only thing that can reach the SQL below, so a stray field in a payload cannot name a column.
_EDITABLE = ("title", "department", "technologies", "contributors", "body_markdown", "slug")

# A review queue is worked oldest-first, so nothing sits there unnoticed; everything else is
# "what did I just touch", which is newest-first.
_ORDER_QUEUED = "ORDER BY p.created_at ASC, p.id ASC"
_ORDER_RECENT = "ORDER BY p.updated_at DESC, p.id DESC"


def _summary(row: dict[str, Any]) -> AdminProjectSummary:
    return AdminProjectSummary(**row)


def _detail(row: dict[str, Any]) -> AdminProjectDetail:
    return AdminProjectDetail(**row, body_html=render_markdown(row["body_markdown"]))


async def list_projects(status: StatusFilter) -> list[AdminProjectSummary]:
    """Every project with the given status, or every project at all for `all`."""
    order = _ORDER_QUEUED if status == "pending" else _ORDER_RECENT
    where = "" if status == "all" else "WHERE p.status = %s"
    params: tuple[Any, ...] = () if status == "all" else (status,)
    rows = await db.fetch(
        f"""
        SELECT {_COLUMNS}
        FROM projects p
        JOIN submitters s ON s.id = p.submitter_id
        {where}
        {order}
        """,
        params,
    )
    return [_summary(row) for row in rows]


async def get_project(project_id: int) -> AdminProjectDetail | None:
    row = await db.fetchrow(_SELECT_BY_ID, (project_id,))
    return None if row is None else _detail(row)


async def apply_edit(project_id: int, values: dict[str, Any]) -> AdminProjectDetail | None:
    """Write the validated fields. `values` keys come from `_EDITABLE` and nothing else.

    Raises `psycopg.errors.UniqueViolation` when a new `slug` is already taken, which the router
    turns into a 409 with a sentence.
    """
    columns = [name for name in _EDITABLE if name in values]
    if not columns:
        return await get_project(project_id)

    assignments = ", ".join(f"{name} = %s" for name in columns)
    params: list[Any] = [values[name] for name in columns]
    params.append(project_id)

    async with db.transaction() as conn:
        cursor = await conn.execute(
            f"""
            UPDATE projects
            SET {assignments}, updated_at = now()
            WHERE id = %s
            RETURNING id
            """,
            params,
        )
        if await cursor.fetchone() is None:
            return None

    return await get_project(project_id)


async def set_status(project_id: int, status: Status) -> AdminProjectSummary | None:
    """Publish, reject or reopen. The dashboard re-reads its whole list afterwards, so this answers
    with the summary rather than the body."""
    async with db.transaction() as conn:
        cursor = await conn.execute(
            "UPDATE projects SET status = %s, updated_at = now() WHERE id = %s RETURNING id",
            (status, project_id),
        )
        if await cursor.fetchone() is None:
            return None

    row = await db.fetchrow(_SELECT_SUMMARY_BY_ID, (project_id,))
    return None if row is None else _summary(row)


async def delete_project(project_id: int) -> str | None:
    """Remove the row, returning its `source_path` so the router can clean up the volume.

    `None` means there was no such project — which the router reports as a 404, so an admin double
    -clicking "delete" sees "already gone" rather than an error.
    """
    async with db.transaction() as conn:
        cursor = await conn.execute(
            "DELETE FROM projects WHERE id = %s RETURNING source_path",
            (project_id,),
        )
        row = await cursor.fetchone()
    return None if row is None else row["source_path"]

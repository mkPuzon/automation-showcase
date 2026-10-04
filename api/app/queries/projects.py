"""Hand-written SQL for projects. Public reads are published-only, always."""

from typing import Any

from .. import db
from ..models import ProjectDetail, ProjectSummary
from ..rendering import render_markdown

# jsonb_build_object keeps the submitter in one round trip instead of an N+1.
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
    jsonb_build_object(
        'id', s.id,
        'first_name', s.first_name,
        'last_name', s.last_name,
        'departments', s.departments
    ) AS submitter
"""


def _summary(row: dict[str, Any]) -> ProjectSummary:
    return ProjectSummary(**row)


async def list_published() -> list[ProjectSummary]:
    rows = await db.fetch(
        f"""
        SELECT {_COLUMNS}
        FROM projects p
        JOIN submitters s ON s.id = p.submitter_id
        WHERE p.status = 'published'
        ORDER BY p.created_at DESC, p.id DESC
        """
    )
    return [_summary(row) for row in rows]


async def get_published_by_slug(slug: str) -> ProjectDetail | None:
    row = await db.fetchrow(
        f"""
        SELECT {_COLUMNS},
               p.body_markdown,
               p.source_filename
        FROM projects p
        JOIN submitters s ON s.id = p.submitter_id
        WHERE p.slug = %s AND p.status = 'published'
        """,
        (slug,),
    )
    if row is None:
        return None
    row["body_html"] = render_markdown(row["body_markdown"])
    return ProjectDetail(**row)

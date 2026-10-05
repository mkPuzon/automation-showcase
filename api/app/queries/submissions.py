"""Hand-written SQL for the write path: one submission = one transaction.

A submission touches two tables, so it must be all-or-nothing: a submitter row without its project
would show up as a phantom author, and a project without its submitter is impossible
(`projects.submitter_id` is NOT NULL). `db.transaction()` gives us that, and a savepoint around the
project insert lets us retry a slug clash without losing the submitter upsert.
"""

from __future__ import annotations

from datetime import date
from typing import Any

import psycopg

from .. import db
from ..slugs import build_slug
from ..validate import SubmissionFields

# The numeric id + timestamp we hand back to SvelteKit.
_INSERT_PROJECT = """
INSERT INTO projects (
    slug, title, body_markdown, technologies, contributors, department,
    submitter_id, status, source_filename, source_path, created_at, updated_at
)
VALUES (
    %(slug)s, %(title)s, %(body_markdown)s, %(technologies)s, %(contributors)s, %(department)s,
    %(submitter_id)s, 'pending', %(source_filename)s, %(source_path)s, %(created_on)s, %(created_on)s
)
RETURNING id, slug, title, status, created_at
"""

# Repeat submitter: name follows the latest submission, departments accumulate (locked decision #3).
_UPSERT_SUBMITTER = """
INSERT INTO submitters (email, first_name, last_name, departments)
VALUES (%(email)s, %(first_name)s, %(last_name)s, %(departments)s)
ON CONFLICT (email) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name  = EXCLUDED.last_name,
    departments = (
        SELECT COALESCE(array_agg(DISTINCT d ORDER BY d), '{}'::text[])
        FROM unnest(submitters.departments || EXCLUDED.departments) AS d
        WHERE d <> ''
    ),
    updated_at = now()
RETURNING id
"""

# `build_slug` appends 4 hex chars; a clash means we drew the same value twice in a day.
MAX_SLUG_ATTEMPTS = 5


class SlugConflict(Exception):
    """Could not claim a URL for the write-up — astronomically unlikely, and retryable."""


async def insert_submission(
    fields: SubmissionFields,
    *,
    body_markdown: str,
    source_filename: str | None,
    source_path: str | None,
    created_on: date,
) -> dict[str, Any]:
    """Upsert the submitter and file the project as `pending`, in one transaction."""
    submitter_params = {
        "email": fields.email,
        "first_name": fields.first_name,
        "last_name": fields.last_name,
        "departments": [fields.department],
    }
    project_params = {
        "title": fields.title,
        "body_markdown": body_markdown,
        "technologies": fields.technologies,
        "contributors": fields.contributors,
        "department": fields.department,
        "source_filename": source_filename,
        "source_path": source_path,
        "created_on": created_on,
    }

    async with db.transaction() as conn:
        cursor = await conn.execute(_UPSERT_SUBMITTER, submitter_params)
        submitter_row = await cursor.fetchone()
        if submitter_row is None:  # pragma: no cover - RETURNING always yields a row
            raise RuntimeError("submitter upsert returned no row")
        submitter_id: int = submitter_row["id"]

        last_error: Exception | None = None
        for _ in range(MAX_SLUG_ATTEMPTS):
            params = {
                **project_params,
                "slug": build_slug(fields.title, created_on),
                "submitter_id": submitter_id,
            }
            try:
                # Nested transaction block -> SAVEPOINT, so a UNIQUE clash is rolled back on its own.
                async with conn.transaction():
                    cursor = await conn.execute(_INSERT_PROJECT, params)
                    row = await cursor.fetchone()
            except psycopg.errors.UniqueViolation as exc:
                last_error = exc
                continue
            if row is not None:
                return row

        raise SlugConflict(
            f"could not reserve a URL for that title after {MAX_SLUG_ATTEMPTS} attempts"
        ) from last_error

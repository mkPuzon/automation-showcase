"""`/api/admin/*` — the review queue, the editor, and the delete.

Every route here is behind `require_admin` (`app/auth.py`): a bearer token SvelteKit signed with the
shared `SESSION_SECRET`. The API port is unpublished, so no browser can reach these directly — but
the token is still what decides, because a network boundary is not a credential.

Two things this layer owns that the web layer cannot:

* The status vocabulary is enforced by the database's check constraint, and `Status`/`StatusFilter`
  are the only spellings FastAPI will accept.
* A project's `slug` changes only when the request says so. Nothing here derives a slug from a title.

Error bodies follow the same rule as the submission route: `detail` is one sentence, written for the
admin reading the dashboard, because SvelteKit shows it as-is.
"""

from __future__ import annotations

import logging
from typing import Annotated

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth import require_admin
from ..config import get_settings
from ..models import (
    AdminProjectDetail,
    AdminProjectSummary,
    AdminProjectEdit,
    BodyPreview,
    PreviewResult,
    StatusChange,
    StatusFilter,
)
from ..queries import admin as admin_queries
from ..rendering import render_markdown
from ..uploads import get_upload_store
from ..validate import SubmissionError, normalize_project_edit

log = logging.getLogger("techshare.api.admin")

router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)

NOT_FOUND = "No project has that id — it may already have been deleted."


@router.get("/projects", response_model=list[AdminProjectSummary])
async def list_projects(
    status: Annotated[StatusFilter, Query()] = "all",
) -> list[AdminProjectSummary]:
    """Everything in the queue, filterable by status; `pending` is oldest first.

    The admin listing is the one place submitter emails appear — that is how an admin follows up on a
    write-up. It is metadata only, like the public list; bodies come from `/projects/{id}`.
    """
    return await admin_queries.list_projects(status)


@router.get("/projects/{project_id}", response_model=AdminProjectDetail)
async def get_project(project_id: int) -> AdminProjectDetail:
    """One project with its stored Markdown and the HTML it renders to."""
    project = await admin_queries.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return project


@router.patch("/projects/{project_id}", response_model=AdminProjectDetail)
async def edit_project(project_id: int, edit: AdminProjectEdit) -> AdminProjectDetail:
    """Change metadata and/or the body. Absent fields are left exactly as they are.

    `slug` is in this endpoint but is *not* derived from `title` anywhere: the editor sends it only
    when the admin used the separate "web address" control (locked decision #4).
    """
    changes = edit.model_dump(exclude_unset=True)
    try:
        values = normalize_project_edit(changes, max_body_chars=get_settings().max_body_chars)
        project = await admin_queries.apply_edit(project_id, values)
    except SubmissionError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message) from exc
    except psycopg.errors.UniqueViolation as exc:
        raise HTTPException(
            status_code=409,
            detail=(
                "Another project already answers to that web address. Choose a different one — "
                "adding the date, or a word, is usually enough."
            ),
        ) from exc

    if project is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return project


@router.post("/projects/{project_id}/status", response_model=AdminProjectSummary)
async def change_status(project_id: int, change: StatusChange) -> AdminProjectSummary:
    """`pending` / `published` / `rejected` — any to any; the admin is the editor, not a workflow."""
    updated = await admin_queries.set_status(project_id, change.status)
    if updated is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return updated


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(project_id: int) -> None:
    """Delete the project, then its `.docx` on the volume.

    The row goes first: a leftover file is worth cleaning up but not worth failing over, and a file
    deleted while the row survives would leave a project whose source cannot be re-parsed.
    """
    source_path = await admin_queries.delete_project(project_id)
    if source_path is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)

    get_upload_store().delete(source_path)
    log.info("deleted project %s", project_id)


@router.post("/preview", response_model=PreviewResult)
async def preview_body(preview: BodyPreview) -> PreviewResult:
    """Render the editor's draft through the same pipeline a reader will use.

    The web layer has no Markdown renderer of its own (deliberately — see `src/lib/markdown.ts`), so
    a live preview has to come from here. Nothing is written: this is `app/rendering.py` on a string
    that is not in the database yet.
    """
    limit = get_settings().max_body_chars
    draft = preview.markdown if len(preview.markdown) <= limit else preview.markdown[:limit]
    return PreviewResult(body_html=render_markdown(draft))

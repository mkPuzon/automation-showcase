"""Public project endpoints."""

from fastapi import APIRouter, HTTPException

from ..models import ProjectDetail, ProjectSummary
from ..queries import projects

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=list[ProjectSummary])
async def list_projects() -> list[ProjectSummary]:
    """Published projects, metadata only — Explore filters this in the browser."""
    return await projects.list_published()


@router.get("/{slug}", response_model=ProjectDetail)
async def get_project(slug: str) -> ProjectDetail:
    """One published project with its body rendered to sanitized HTML."""
    project = await projects.get_published_by_slug(slug)
    if project is None:
        raise HTTPException(status_code=404, detail="project not found")
    return project

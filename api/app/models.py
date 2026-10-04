"""Response/request models. `status` is the one vocabulary: pending | published | rejected."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

Status = Literal["pending", "published", "rejected"]


class SubmitterBrief(BaseModel):
    """Public view of a submitter — email is never exposed outside the admin API."""

    id: int
    first_name: str
    last_name: str
    departments: list[str]


class ProjectSummary(BaseModel):
    """Metadata only (no body) — everything Explore needs for client-side filtering."""

    id: int
    slug: str
    title: str
    department: str
    technologies: list[str]
    contributors: list[str]
    status: Status
    created_at: datetime
    updated_at: datetime
    submitter: SubmitterBrief


class ProjectDetail(ProjectSummary):
    body_markdown: str
    body_html: str
    source_filename: str | None = None

"""Response/request models. `status` is the one vocabulary: pending | published | rejected."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

Status = Literal["pending", "published", "rejected"]
# The admin dashboard's filter: the three real statuses, or everything at once.
StatusFilter = Literal["pending", "published", "rejected", "all"]


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


class AdminSubmitter(SubmitterBrief):
    """Admin view of a submitter. The email is what an admin replies to; it is never in a public
    payload — these models are reachable only through `/api/admin`."""

    email: str


class AdminProjectSummary(ProjectSummary):
    """The review queue: same metadata as the public list, plus the submitter's email and the
    original file. No body — the dashboard lists many projects, the editor opens one."""

    submitter: AdminSubmitter
    source_filename: str | None = None
    source_path: str | None = None


class AdminProjectDetail(AdminProjectSummary):
    """One project for the editor, including the Markdown it will put in the textarea."""

    body_markdown: str
    body_html: str


class AdminProjectEdit(BaseModel):
    """`PATCH /api/admin/projects/{id}`. A field that is absent is left alone; a field that is
    present is replaced. `slug` only ever changes when it is sent on purpose — renaming a project
    must not move its URL (locked decision #4)."""

    title: str | None = None
    department: str | None = None
    technologies: list[str] | None = None
    contributors: list[str] | None = None
    body_markdown: str | None = None
    slug: str | None = None


class StatusChange(BaseModel):
    status: Status


class BodyPreview(BaseModel):
    """`POST /api/admin/preview` — the draft in the editor's textarea, before anything is saved."""

    markdown: str = ""


class PreviewResult(BaseModel):
    body_html: str


class SubmissionResult(BaseModel):
    """What `POST /api/submissions` answers with — enough for a confirmation screen.

    `warning` is the soft half of the email rule (locked decision #8): the submission succeeded,
    something about it looked unusual. Email is deliberately absent, as everywhere outside admin.
    """

    id: int
    slug: str
    title: str
    status: Status
    created_at: datetime
    warning: str | None = None

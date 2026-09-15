from datetime import datetime, timezone
import os
import re
from typing import Generator

import bleach
import markdown
from fastapi import Cookie, Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import JSON, DateTime, Integer, String, Text, case, create_engine, inspect, select, text
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg://automation:automation@localhost:5432/automation")
ADMIN_COOKIE = "automation_admin"


def configured_admin_password() -> str:
    """Read the configured password from the process environment.

    Reading this at request time keeps the API tied to ADMIN_PASSWORD rather
    than a value captured when this module happened to be imported.
    """
    return os.getenv("ADMIN_PASSWORD", "change-me")
EMAIL_PATTERN = re.compile(r"^[A-Za-z]+@colby\.edu$")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description_markdown: Mapped[str] = mapped_column(Text, nullable=False)
    contributors: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    tools: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    department: Mapped[str] = mapped_column(String(160), nullable=False)
    submitter_email: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reviewed_by: Mapped[str | None] = mapped_column(String(160))
    rejection_reason: Mapped[str | None] = mapped_column(Text)


class ProjectInput(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description_markdown: str = Field(min_length=1)
    contributors: list[str] = Field(min_length=1)
    tools: list[str] = Field(min_length=1)
    department: str = Field(min_length=1, max_length=160)
    submitter_email: str

    @field_validator("submitter_email")
    @classmethod
    def valid_colby_email(cls, value: str) -> str:
        if not EMAIL_PATTERN.fullmatch(value):
            raise ValueError("Use a staff email in the form name@colby.edu")
        return value

    @field_validator("contributors", "tools")
    @classmethod
    def non_empty_values(cls, values: list[str]) -> list[str]:
        cleaned = [value.strip() for value in values if value.strip()]
        if not cleaned:
            raise ValueError("Provide at least one value")
        return cleaned


class ProjectOut(ProjectInput):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: str
    submitted_at: datetime
    detail_slug: str
    description_html: str
    reviewed_at: datetime | None
    reviewed_by: str | None
    rejection_reason: str | None


class AdminProjectUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description_markdown: str | None = Field(default=None, min_length=1)
    contributors: list[str] | None = None
    tools: list[str] | None = None
    department: str | None = Field(default=None, min_length=1, max_length=160)
    submitter_email: str | None = None
    status: str | None = None
    rejection_reason: str | None = None

    @field_validator("submitter_email")
    @classmethod
    def valid_colby_email(cls, value: str | None) -> str | None:
        if value is not None and not EMAIL_PATTERN.fullmatch(value):
            raise ValueError("Use a staff email in the form name@colby.edu")
        return value

    @field_validator("status")
    @classmethod
    def valid_status(cls, value: str | None) -> str | None:
        if value is not None and value not in {"pending", "approved", "rejected"}:
            raise ValueError("Status must be pending, approved, or rejected")
        return value


def get_db() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        yield session


def slug_for(project: Project) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", project.title.lower()).strip("-") or "project"
    return f"{slug}-{project.submitted_at.date().isoformat()}-{project.id}"


def serialize(project: Project) -> ProjectOut:
    return ProjectOut(
        title=project.title,
        description_markdown=project.description_markdown,
        contributors=project.contributors,
        tools=project.tools,
        department=project.department,
        submitter_email=project.submitter_email,
        id=project.id,
        status=project.status,
        submitted_at=project.submitted_at,
        detail_slug=slug_for(project),
        description_html=render_markdown(project.description_markdown),
        reviewed_at=project.reviewed_at,
        reviewed_by=project.reviewed_by,
        rejection_reason=project.rejection_reason,
    )


def require_admin(automation_admin: str | None = Cookie(default=None)) -> None:
    if automation_admin != "authenticated":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin login required")


app = FastAPI(title="Automation Showcase API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("FRONTEND_ORIGIN", "http://localhost:5173,http://localhost:4173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict[str, str]:
    return {
        "name": "Colby Automation Showcase API",
        "status": "ok",
        "docs": "/docs",
        "health": "/api/health",
    }


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(engine)
    # Keep schema evolution explicit but lightweight for this MVP. A future
    # production deployment can replace this with Alembic migrations.
    existing_columns = {column["name"] for column in inspect(engine).get_columns("projects")}
    with engine.begin() as connection:
        if "reviewed_by" not in existing_columns:
            connection.execute(text("ALTER TABLE projects ADD COLUMN reviewed_by VARCHAR(160)"))
        if "rejection_reason" not in existing_columns:
            connection.execute(text("ALTER TABLE projects ADD COLUMN rejection_reason TEXT"))
    if os.getenv("SEED_LOCAL", "false").lower() == "true":
        with SessionLocal() as db:
            if db.scalar(select(Project.id).limit(1)) is None:
                now = datetime.now(timezone.utc)
                db.add_all([
                    Project(title="Zoom meeting transcriptions", description_markdown="""# Zoom Meeting Transcriptions
Transcripts are intended for retaining and saving speech-to-text data in the meeting.

Meeting hosts can manage transcript availability during meetings, and participants may be able to request transcript access during a meeting.

## Requirements for enabling or disabling meeting transcripts

1) Meeting transcript must be enabled
2) Zoom desktop app for Windows, macOS, or Linux: Global minimum version or higher
3) Zoom mobile app for Android or iOS: Global minimum version or higher

## How to start or stop meeting transcript as a host

1) Start a Zoom meeting.
2) In the meeting controls toolbar, click More then Transcript. The meeting transcript will start.
3) (Optional) To stop the meeting transcription, in the top-right corner of the meeting window, hover over the Transcript icon, then click Stop transcription. A confirmation window will appear.
4) (Optional) In the window, select the Delete transcript checkbox.
5) Click Stop transcription.""", contributors=["Alex Morgan"], tools=["Zoom"], department="Academic Affairs", submitter_email="alex@colby.edu", status="approved", submitted_at=now),
                    Project(title="Weekly enrollment summary", description_markdown="Create a weekly summary from a spreadsheet using a repeatable workflow.", contributors=["Jamie Lee"], tools=["Google Sheets", "Zapier"], department="Institutional Research", submitter_email="jamie@colby.edu", status="pending", submitted_at=now),
                    Project(title="Automated event reminder workflow", description_markdown="Send timely reminders to registrants before campus events and keep the event team informed when responses change.", contributors=["Priya Shah", "Morgan Ellis"], tools=["Microsoft Forms", "Power Automate", "Outlook"], department="Campus Events", submitter_email="priya@colby.edu", status="approved", submitted_at=now),
                    Project(title="Library reading list cleanup", description_markdown="Normalize faculty reading lists, identify duplicate entries, and prepare a clean spreadsheet for library staff to review.", contributors=["Riley Chen"], tools=["Google Sheets", "OpenRefine", "Python"], department="Libraries", submitter_email="riley@colby.edu", status="approved", submitted_at=now),
                    Project(title="Student advising notes assistant", description_markdown="Turn structured advising notes into a consistent follow-up checklist so students and advisors leave each meeting with clear next steps.", contributors=["Taylor Brooks"], tools=["Notion", "ChatGPT", "Google Docs"], department="Student Affairs", submitter_email="taylor@colby.edu", status="approved", submitted_at=now),
                    Project(title="Facilities work order triage", description_markdown="Route incoming facilities requests to the right team, flag urgent issues, and give requesters an automatic status update.", contributors=["Casey Williams", "Jordan Kim"], tools=["Jira", "Slack", "Make"], department="Facilities", submitter_email="casey@colby.edu", status="approved", submitted_at=now),
                    Project(title="Research data quality checks", description_markdown="Run repeatable checks on research data files before analysis and produce a short report of missing or inconsistent values.", contributors=["Sam Rivera"], tools=["Python", "R", "GitHub Actions"], department="Research", submitter_email="sam@colby.edu", status="approved", submitted_at=now),
                ])
                db.commit()


@app.get("/api/health")
def health(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(select(1))
    return {"status": "ok"}


@app.post("/api/admin/login")
def admin_login(password: str, response: Response) -> dict[str, str]:
    if password != configured_admin_password():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password")
    response.set_cookie(ADMIN_COOKIE, "authenticated", httponly=True, samesite="lax", max_age=86400)
    return {"status": "authenticated"}


@app.post("/api/admin/logout")
def admin_logout(response: Response) -> dict[str, str]:
    response.delete_cookie(ADMIN_COOKIE)
    return {"status": "signed out"}


@app.get("/api/projects", response_model=list[ProjectOut])
def list_public_projects(db: Session = Depends(get_db)) -> list[ProjectOut]:
    projects = db.scalars(select(Project).where(Project.status == "approved").order_by(Project.submitted_at.desc())).all()
    return [serialize(project) for project in projects]


@app.get("/api/projects/{slug}", response_model=ProjectOut)
def get_public_project(slug: str, db: Session = Depends(get_db)) -> ProjectOut:
    projects = db.scalars(select(Project).where(Project.status == "approved")).all()
    for project in projects:
        if slug_for(project) == slug:
            return serialize(project)
    raise HTTPException(status_code=404, detail="Project not found")


@app.get("/api/options")
def list_options(db: Session = Depends(get_db)) -> dict[str, list[str]]:
    projects = db.scalars(select(Project)).all()
    return {
        "contributors": sorted({name for project in projects for name in project.contributors}),
        "tools": sorted({name for project in projects for name in project.tools}),
        "departments": sorted({project.department for project in projects}),
    }


@app.post("/api/projects", response_model=ProjectOut, status_code=201)
def create_project(payload: ProjectInput, db: Session = Depends(get_db)) -> ProjectOut:
    project = Project(**payload.model_dump(), status="pending", submitted_at=datetime.now(timezone.utc))
    db.add(project)
    db.commit()
    db.refresh(project)
    return serialize(project)


@app.get("/api/admin/projects", response_model=list[ProjectOut], dependencies=[Depends(require_admin)])
def list_admin_projects(status: str | None = None, db: Session = Depends(get_db)) -> list[ProjectOut]:
    status_order = case(
        (Project.status == "pending", 0),
        (Project.status == "approved", 1),
        (Project.status == "rejected", 2),
        else_=3,
    )
    query = select(Project).order_by(status_order, Project.submitted_at.desc())
    if status:
        if status not in {"pending", "approved", "rejected"}:
            raise HTTPException(status_code=400, detail="Invalid status filter")
        query = query.where(Project.status == status)
    projects = db.scalars(query).all()
    return [serialize(project) for project in projects]


@app.patch("/api/admin/projects/{project_id}", response_model=ProjectOut, dependencies=[Depends(require_admin)])
def edit_project(project_id: int, payload: AdminProjectUpdate, db: Session = Depends(get_db)) -> ProjectOut:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    values = payload.model_dump(exclude_unset=True)
    if "status" in values:
        project.status = values.pop("status")
        project.reviewed_at = datetime.now(timezone.utc)
        project.reviewed_by = "admin"
        if project.status != "rejected" and "rejection_reason" not in values:
            project.rejection_reason = None
    for key, value in values.items():
        setattr(project, key, value)
    db.commit()
    db.refresh(project)
    return serialize(project)


@app.delete("/api/admin/projects/{project_id}", status_code=204, dependencies=[Depends(require_admin)])
def delete_project(project_id: int, db: Session = Depends(get_db)) -> Response:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    db.delete(project)
    db.commit()
    return Response(status_code=204)


def render_markdown(source: str) -> str:
    html = markdown.markdown(source, extensions=["extra", "sane_lists"])
    return bleach.clean(html, tags=["p", "br", "strong", "em", "ul", "ol", "li", "h1", "h2", "h3", "h4", "blockquote", "code", "pre", "a", "img"], attributes={"a": ["href", "title"], "img": ["src", "alt", "title"]}, protocols=["http", "https"])


@app.post("/api/markdown/preview")
def markdown_preview(source: str) -> dict[str, str]:
    return {"html": render_markdown(source)}

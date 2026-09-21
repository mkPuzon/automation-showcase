from datetime import datetime, timedelta, timezone
from io import BytesIO
import os
import re
from pathlib import Path
from typing import Generator
from uuid import uuid4

import bleach
import markdown
from fastapi import Body, Cookie, Depends, FastAPI, File, HTTPException, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator
from fastapi.responses import FileResponse
from sqlalchemy import JSON, DateTime, Integer, String, Text, case, create_engine, inspect, select, text
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from pypdf import PdfReader

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg://automation:automation@localhost:5432/automation")
ADMIN_COOKIE = "automation_admin"
MAX_PDF_BYTES = 10 * 1024 * 1024
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGES_PER_SUBMISSION = 10
IMAGE_RETENTION_HOURS = 24
UPLOADS_DIR = Path(os.getenv("UPLOADS_DIR", "./uploads"))
PUBLIC_API_URL = os.getenv("PUBLIC_API_URL", "http://localhost:8000").rstrip("/")
ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg"}


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


class ImageAsset(Base):
    __tablename__ = "image_assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    filename: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    project_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    draft_token: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ProjectInput(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description_markdown: str = Field(min_length=1)
    contributors: list[str] = Field(min_length=1)
    tools: list[str] = Field(min_length=1)
    department: str = Field(min_length=1, max_length=160)
    submitter_email: str
    draft_token: str | None = Field(default=None, exclude=True)

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
    cleanup_unclaimed_images()
    if os.getenv("SEED_LOCAL", "false").lower() == "true":
        with SessionLocal() as db:
            if db.scalar(select(Project.id).limit(1)) is None:
                now = datetime.now(timezone.utc)
                db.add(Project(
                    title="Test Automation Project",
                    description_markdown="# Test Automation Project\n\nThis is a generic seeded project for testing the showcase.",
                    contributors=["Test User"],
                    tools=["Test Tool"],
                    department="Test Department",
                    submitter_email="test@colby.edu",
                    status="approved",
                    submitted_at=now,
                ))
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
    values = payload.model_dump(exclude={"draft_token"})
    project = Project(**values, status="pending", submitted_at=datetime.now(timezone.utc))
    db.add(project)
    db.flush()
    if payload.draft_token:
        assets = db.scalars(select(ImageAsset).where(ImageAsset.draft_token == payload.draft_token)).all()
        if len(assets) > MAX_IMAGES_PER_SUBMISSION:
            raise HTTPException(status_code=400, detail="A submission may contain at most 10 images.")
        for asset in assets:
            asset.project_id = project.id
            asset.draft_token = None
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
    assets = db.scalars(select(ImageAsset).where(ImageAsset.project_id == project_id)).all()
    for asset in assets:
        (UPLOADS_DIR / asset.filename).unlink(missing_ok=True)
        db.delete(asset)
    db.delete(project)
    db.commit()
    return Response(status_code=204)


def image_markdown(asset: ImageAsset) -> str:
    return f"![{asset.original_filename}]({PUBLIC_API_URL}/api/uploads/{asset.filename})"


def validate_image_upload(file: UploadFile, content: bytes) -> str:
    original = Path(file.filename or "")
    extension = original.suffix.lower()
    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Images must use a .png or .jpg filename.")
    if file.content_type not in {"image/png", "image/jpeg"}:
        raise HTTPException(status_code=400, detail="Images must be PNG or JPEG files.")
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Images must be 5 MB or smaller.")
    if extension == ".png" and not content.startswith(b"\x89PNG\r\n\x1a\n"):
        raise HTTPException(status_code=400, detail="The uploaded file is not a valid PNG image.")
    if extension == ".jpg" and not (content.startswith(b"\xff\xd8\xff") and content.endswith(b"\xff\xd9")):
        raise HTTPException(status_code=400, detail="The uploaded file is not a valid JPG image.")
    return extension


def store_image(file: UploadFile, content: bytes, *, project_id: int | None = None, draft_token: str | None = None, db: Session) -> ImageAsset:
    extension = validate_image_upload(file, content)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    asset = ImageAsset(
        filename=f"{uuid4().hex}{extension}",
        original_filename=Path(file.filename or "image").name[:255],
        project_id=project_id,
        draft_token=draft_token,
        uploaded_at=datetime.now(timezone.utc),
    )
    (UPLOADS_DIR / asset.filename).write_bytes(content)
    db.add(asset)
    try:
        db.commit()
        db.refresh(asset)
    except Exception:
        db.rollback()
        (UPLOADS_DIR / asset.filename).unlink(missing_ok=True)
        raise
    return asset


def cleanup_unclaimed_images() -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=IMAGE_RETENTION_HOURS)
    with SessionLocal() as db:
        assets = db.scalars(select(ImageAsset).where(ImageAsset.project_id.is_(None), ImageAsset.uploaded_at < cutoff)).all()
        for asset in assets:
            (UPLOADS_DIR / asset.filename).unlink(missing_ok=True)
            db.delete(asset)
        db.commit()


def render_markdown(source: str) -> str:
    html = markdown.markdown(source, extensions=["extra", "sane_lists"])
    return bleach.clean(html, tags=["p", "br", "strong", "em", "ul", "ol", "li", "h1", "h2", "h3", "h4", "blockquote", "code", "pre", "a", "img"], attributes={"a": ["href", "title"], "img": ["src", "alt", "title"]}, protocols=["http", "https"])


@app.post("/api/uploads", status_code=201)
def upload_submission_image(
    file: UploadFile = File(...),
    draft_token: str = "",
    db: Session = Depends(get_db),
) -> dict[str, str]:
    if not re.fullmatch(r"[A-Za-z0-9_-]{20,100}", draft_token):
        raise HTTPException(status_code=400, detail="A valid draft token is required.")
    existing_count = len(db.scalars(select(ImageAsset).where(ImageAsset.draft_token == draft_token)).all())
    if existing_count >= MAX_IMAGES_PER_SUBMISSION:
        raise HTTPException(status_code=400, detail="A submission may contain at most 10 images.")
    content = file.file.read(MAX_IMAGE_BYTES + 1)
    asset = store_image(file, content, draft_token=draft_token, db=db)
    return {"url": f"{PUBLIC_API_URL}/api/uploads/{asset.filename}", "markdown": image_markdown(asset), "filename": asset.original_filename}


@app.post("/api/admin/projects/{project_id}/images", status_code=201, dependencies=[Depends(require_admin)])
def upload_admin_image(project_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)) -> dict[str, str]:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    count = len(db.scalars(select(ImageAsset).where(ImageAsset.project_id == project_id)).all())
    if count >= MAX_IMAGES_PER_SUBMISSION:
        raise HTTPException(status_code=400, detail="A project may contain at most 10 images.")
    content = file.file.read(MAX_IMAGE_BYTES + 1)
    asset = store_image(file, content, project_id=project_id, db=db)
    return {"url": f"{PUBLIC_API_URL}/api/uploads/{asset.filename}", "markdown": image_markdown(asset), "filename": asset.original_filename}


@app.get("/api/uploads/{filename}")
def get_uploaded_image(filename: str, db: Session = Depends(get_db)) -> FileResponse:
    if Path(filename).name != filename or not re.fullmatch(r"[a-f0-9]{32}\.(?:png|jpg)", filename):
        raise HTTPException(status_code=404, detail="Image not found")
    asset = db.scalar(select(ImageAsset).where(ImageAsset.filename == filename))
    if not asset or not asset.project_id:
        raise HTTPException(status_code=404, detail="Image not found")
    project = db.get(Project, asset.project_id)
    if not project or project.status != "approved":
        raise HTTPException(status_code=404, detail="Image not found")
    path = UPLOADS_DIR / asset.filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(path, media_type="image/png" if path.suffix == ".png" else "image/jpeg")


@app.post("/api/markdown/preview")
def markdown_preview(payload: dict[str, str] = Body(...)) -> dict[str, str]:
    return {"html": render_markdown(payload.get("source", ""))}


@app.post("/api/markdown/from-pdf")
def markdown_from_pdf(file: UploadFile = File(...)) -> dict[str, str]:
    filename = (file.filename or "").lower()
    if not filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Upload a PDF file.")

    content = file.file.read(MAX_PDF_BYTES + 1)
    if len(content) > MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail="PDF files must be 10 MB or smaller.")
    if not content.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="The uploaded file is not a valid PDF.")

    try:
        reader = PdfReader(BytesIO(content))
        if reader.is_encrypted:
            raise HTTPException(status_code=400, detail="Encrypted PDFs are not supported.")
        extracted_pages = []
        for page in reader.pages:
            try:
                extracted_pages.append(page.extract_text(extraction_mode="layout") or "")
            except TypeError:
                # Keep compatibility with pypdf versions that do not support
                # the layout extraction argument.
                extracted_pages.append(page.extract_text() or "")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not read the PDF.") from exc

    source = pdf_text_to_markdown("\n\n".join(extracted_pages))
    if not source.strip():
        raise HTTPException(
            status_code=422,
            detail="This PDF did not contain selectable text. Image-only PDFs are not supported yet.",
        )
    return {"description_markdown": source}


def pdf_text_to_markdown(text_content: str) -> str:
    """Turn layout-preserving PDF text into readable, conservative Markdown.

    PDF text extraction usually wraps paragraphs at the page's visual line width.
    This parser keeps blank-line structure, rejoins wrapped prose, and only turns
    strong heading signals into Markdown headings so ordinary uppercase sentences
    do not become a page full of headings.
    """
    raw_lines = text_content.replace("\r", "").split("\n")
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in raw_lines]
    lines = expand_inline_list_lines(lines)
    lines = remove_repeated_page_artifacts(lines)
    lines = preserve_list_continuations(lines)

    blocks: list[str] = []
    paragraph: list[str] = []
    list_items: list[str] = []
    seen_content = False

    def flush_paragraph() -> None:
        if paragraph:
            blocks.append(join_wrapped_lines(paragraph))
            paragraph.clear()

    def flush_list() -> None:
        if list_items:
            blocks.append("\n".join(list_items))
            list_items.clear()

    for index, line in enumerate(lines):
        if not line:
            flush_paragraph()
            flush_list()
            continue

        bullet = re.match(r"^(?:[•◦▪‣]|[-*])\s*(.+)$", line)
        numbered = re.match(r"^(\d+)[.)]\s+(.+)$", line)
        if bullet:
            flush_paragraph()
            list_items.append(f"- {bullet.group(1).strip()}")
            seen_content = True
            continue
        if numbered:
            flush_paragraph()
            list_items.append(f"{numbered.group(1)}. {numbered.group(2).strip()}")
            seen_content = True
            continue

        flush_list()
        previous = lines[index - 1] if index > 0 else None
        following = next_non_empty(lines, index)
        if is_pdf_heading(line, is_first=not seen_content, previous=previous, following=following):
            flush_paragraph()
            level = 1 if not seen_content else 2
            blocks.append(f"{'#' * level} {normalise_heading(line)}")
            seen_content = True
            continue

        if paragraph and paragraph[-1].endswith("-") and following is not None:
            paragraph[-1] = paragraph[-1][:-1]
        paragraph.append(line)
        seen_content = True

    flush_paragraph()
    flush_list()
    return "\n\n".join(block for block in blocks if block.strip())


def expand_inline_list_lines(lines: list[str]) -> list[str]:
    expanded: list[str] = []
    for line in lines:
        if re.match(r"^(?:[•◦▪‣]|[-*])\s+", line):
            expanded.extend(re.split(r"\s+(?=[•◦▪‣])", line))
        elif re.match(r"^\d+[.)]\s+", line):
            expanded.extend(re.split(r"\s+(?=\d+[.)]\s+)", line))
        else:
            expanded.append(line)
    return expanded


def list_kind(line: str) -> str | None:
    if re.match(r"^(?:[•◦▪‣]|[-*])\s+", line):
        return "unordered"
    if re.match(r"^\d+[.)]\s+", line):
        return "ordered"
    return None


def preserve_list_continuations(lines: list[str]) -> list[str]:
    """Keep blank-separated items in one Markdown list."""
    preserved: list[str] = []
    for index, line in enumerate(lines):
        if not line and preserved:
            previous = list_kind(preserved[-1])
            following = next_non_empty(lines, index)
            if previous and following and previous == list_kind(following):
                continue
        preserved.append(line)
    return preserved


def next_non_empty(lines: list[str], index: int) -> str | None:
    for candidate in lines[index + 1 :]:
        if candidate:
            return candidate
    return None


def is_pdf_heading(line: str, *, is_first: bool, previous: str | None, following: str | None) -> bool:
    words = line.split()
    if len(line) > 100 or len(words) > 14:
        return False
    if line.startswith("#"):
        return True
    if is_first and len(words) <= 12 and (line.isupper() or line.istitle()):
        return True
    if not following:
        return False
    separated = previous is None or previous == ""
    return separated and (line.isupper() or (line.istitle() and len(words) <= 10))


def normalise_heading(line: str) -> str:
    if line.startswith("#"):
        return line.lstrip("# ").strip()
    if line.isupper():
        return line.title()
    return line


def join_wrapped_lines(lines: list[str]) -> str:
    joined: list[str] = []
    for line in lines:
        if joined and joined[-1].endswith("-") and line[:1].islower():
            joined[-1] = joined[-1][:-1] + line
        else:
            joined.append(line)
    return " ".join(joined).strip()


def remove_repeated_page_artifacts(lines: list[str]) -> list[str]:
    """Drop standalone page numbers and repeated short headers/footers."""
    counts: dict[str, int] = {}
    for line in lines:
        if line and len(line) <= 80 and not re.match(r"^(?:[•◦▪‣]|[-*]|\d+[.)])\s+", line):
            counts[line] = counts.get(line, 0) + 1
    repeated = {
        line for line, count in counts.items() if count >= 2 and not line.endswith((".", ",", ";", ":"))
    }
    return [line for line in lines if not (line.isdigit() and len(line) <= 4) and line not in repeated]

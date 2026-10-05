"""`POST /api/submissions` — the only write path reachable without admin.

Order matters: validate the metadata, check the upload, parse it, *then* touch the volume and the
database. A file that cannot be parsed never reaches disk, and if the transaction fails the file we
did write gets deleted.

Anti-bot here is deliberately thin (honeypot + size/type caps). Rate limiting and the
render→submit delay live in the web container (`src/hooks.server.ts`), because that is the only
place that sees the browser's real IP behind Dokploy's proxy.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ..config import get_settings
from ..docx import DOCX_CONTENT_TYPES, DocxError, docx_to_markdown
from ..models import SubmissionResult
from ..queries.submissions import SlugConflict, insert_submission
from ..uploads import UploadError, get_upload_store
from ..validate import SubmissionError, normalize_submission

router = APIRouter(prefix="/api/submissions", tags=["submissions"])

# Honeypot field name, mirrored by src/lib/components/SubmissionForm.svelte. A human never fills it;
# a naive bot does, and we reject with a deliberately generic message.
HONEYPOT_FIELD = "company"

BOT_MESSAGE = "That submission could not be accepted."


# The metadata fields are `str | None` on purpose: FastAPI treats an empty form value as *missing*,
# and a required `str` would then answer with pydantic's error list. We want app.validate to be the
# one that decides, so that every rejection is a sentence a submitter can act on.
@router.post("", response_model=SubmissionResult, status_code=201)
async def create_submission(
    document: Annotated[UploadFile, File()],
    first_name: Annotated[str | None, Form()] = None,
    last_name: Annotated[str | None, Form()] = None,
    email: Annotated[str | None, Form()] = None,
    department: Annotated[str | None, Form()] = None,
    title: Annotated[str | None, Form()] = None,
    technologies: Annotated[list[str] | None, Form()] = None,
    contributors: Annotated[list[str] | None, Form()] = None,
    honeypot: Annotated[str, Form(alias=HONEYPOT_FIELD)] = "",
) -> SubmissionResult:
    """Parse a `.docx` write-up and file it as a `pending` project."""
    settings = get_settings()

    if honeypot.strip():
        raise HTTPException(status_code=422, detail=BOT_MESSAGE)

    try:
        fields = normalize_submission(
            first_name=first_name,
            last_name=last_name,
            email=email,
            department=department,
            title=title,
            technologies=technologies,
            contributors=contributors,
        )
    except SubmissionError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message) from exc

    filename = Path(document.filename or "").name
    if not filename.lower().endswith(".docx"):
        raise HTTPException(
            status_code=422,
            detail="The write-up has to be a .docx file. In Google Docs use "
            "File > Download > Microsoft Word (.docx).",
        )
    if (document.content_type or "") not in DOCX_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"That does not look like a Word document ({document.content_type}).",
        )

    limit = settings.max_upload_bytes
    try:
        data = await document.read(limit + 1)
    finally:
        await document.close()

    if len(data) > limit:
        raise HTTPException(
            status_code=413,
            detail=f"That file is bigger than the {settings.max_upload_mb} MB limit. Trim the "
            "document — screenshots are what usually does it — and upload again.",
        )

    try:
        body_markdown = docx_to_markdown(data, max_body_chars=settings.max_body_chars)
    except DocxError as exc:
        raise HTTPException(status_code=422, detail=exc.message) from exc

    created_on = datetime.now(UTC).date()
    store = get_upload_store()
    try:
        source_path = store.save(original_filename=filename, created_on=created_on, data=data)
    except UploadError as exc:
        raise HTTPException(status_code=503, detail=exc.message) from exc

    try:
        row = await insert_submission(
            fields,
            body_markdown=body_markdown,
            source_filename=filename[:255],
            source_path=source_path,
            created_on=created_on,
        )
    except SlugConflict as exc:
        store.delete(source_path)
        raise HTTPException(
            status_code=503,
            detail="We could not reserve a web address for that write-up. Submit again and it "
            "should go through.",
        ) from exc
    except Exception:
        # No row, no reason to keep the file.
        store.delete(source_path)
        raise

    return SubmissionResult(**row, warning=fields.warning)

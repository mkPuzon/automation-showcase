"""Submission metadata validation — the server-side half of the rules.

The browser runs the same rules in `src/lib/validation.ts` purely so the form can answer instantly;
this module is the one that decides. Keep the two in step.

Email rule (locked decision #8): the `@colby.edu` domain is a hard requirement, and the local part
only ever produces a *warning* — `letters@colby.edu` and `first.last@colby.edu` are conventional,
something like `jchen24@colby.edu` or `sl-help@colby.edu` still submits, with a note.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Final

MAX_NAME_CHARS: Final[int] = 80
MAX_DEPARTMENT_CHARS: Final[int] = 120
MAX_TITLE_CHARS: Final[int] = 200
MIN_TITLE_CHARS: Final[int] = 4
MAX_LIST_ITEMS: Final[int] = 20
MAX_LIST_ITEM_CHARS: Final[int] = 60
MAX_SLUG_CHARS: Final[int] = 160
MIN_SLUG_CHARS: Final[int] = 3

# local@colby.edu and nothing else; @colby.edu or a sub-domain is not "Colby" for our purposes.
COLBY_EMAIL = re.compile(r"^[A-Za-z0-9._%+\-]+@colby\.edu$")
# letters, optionally separated by single dots: "mdubois", "marie.dubois", "letters"
CONVENTIONAL_LOCAL_PART = re.compile(r"^[A-Za-z]+(\.[A-Za-z]+)*$")
_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")

# Shown in the confirmation screen, not as an error: the submission still goes through.
ODD_LOCAL_PART_WARNING: Final[str] = (
    "That address does not look like the usual Colby pattern. Your write-up was still submitted — "
    "if an admin has a question they will reply to it."
)


class SubmissionError(Exception):
    """Invalid input, from a submitter or from an admin edit.

    `.message` is one sentence written for the person at the keyboard — SvelteKit prints it as-is —
    and `.status` is the HTTP status to answer with. Admin edits reuse it: the shape of the answer
    is the same even though the field names are not.
    """

    def __init__(self, message: str, *, field: str | None = None, status: int = 422) -> None:
        super().__init__(message)
        self.message = message
        self.field = field
        self.status = status


@dataclass(frozen=True)
class SubmissionFields:
    """Normalized metadata, ready to be bound into SQL."""

    first_name: str
    last_name: str
    email: str
    department: str
    title: str
    technologies: list[str] = field(default_factory=list)
    contributors: list[str] = field(default_factory=list)
    warning: str | None = None


def _clean(value: str | None) -> str:
    return _CONTROL_CHARS.sub(" ", value or "").strip()


def _required_text(value: str | None, *, label: str, maximum: int, name: str) -> str:
    text = _clean(value)
    if not text:
        raise SubmissionError(f"{label} is required.", field=name)
    if len(text) > maximum:
        raise SubmissionError(
            f"{label} must be {maximum} characters or fewer (that one is {len(text)}).", field=name
        )
    return text


def _list(values: list[str] | None, *, label: str, name: str) -> list[str]:
    items: list[str] = []
    seen: set[str] = set()
    for raw in values or []:
        # A single field may arrive as "Python, pandas" — split before normalizing.
        for part in _clean(raw).split(","):
            item = part.strip()
            if not item:
                continue
            if len(item) > MAX_LIST_ITEM_CHARS:
                raise SubmissionError(
                    f"Each {label.lower()} must be {MAX_LIST_ITEM_CHARS} characters or fewer "
                    f'("{item[:30]}…" is longer).',
                    field=name,
                )
            key = item.lower()
            if key in seen:
                continue
            seen.add(key)
            items.append(item)
    if len(items) > MAX_LIST_ITEMS:
        raise SubmissionError(
            f"List at most {MAX_LIST_ITEMS} {label.lower()}s — that submission has "
            f"{len(items)}.",
            field=name,
        )
    return items


def normalize_email(value: str | None) -> str:
    """Lowercased `@colby.edu` address, or a SubmissionError."""
    email = _clean(value).lower()
    if not email:
        raise SubmissionError("Your Colby email address is required.", field="email")
    if not COLBY_EMAIL.match(email):
        raise SubmissionError(
            "Use your @colby.edu address — the forum is for Colby staff and faculty, and personal "
            "addresses are not accepted.",
            field="email",
        )
    return email


def email_warning(email: str) -> str | None:
    """The soft half of the email rule: odd local part, but still `@colby.edu`."""
    local, _, _domain = email.partition("@")
    return None if CONVENTIONAL_LOCAL_PART.match(local) else ODD_LOCAL_PART_WARNING


def normalize_submission(
    *,
    first_name: str | None,
    last_name: str | None,
    email: str | None,
    department: str | None,
    title: str | None,
    technologies: list[str] | None = None,
    contributors: list[str] | None = None,
) -> SubmissionFields:
    """Validate and normalize every metadata field in one pass."""
    first = _required_text(
        first_name, label="First name", maximum=MAX_NAME_CHARS, name="first_name"
    )
    last = _required_text(last_name, label="Last name", maximum=MAX_NAME_CHARS, name="last_name")
    normalized_email = normalize_email(email)
    dept = _required_text(
        department, label="Department or unit", maximum=MAX_DEPARTMENT_CHARS, name="department"
    )
    project_title = _required_text(
        title, label="Title", maximum=MAX_TITLE_CHARS, name="title"
    )
    if len(project_title) < MIN_TITLE_CHARS:
        raise SubmissionError(
            f"That title is too short to browse by — give the write-up a real title "
            f"({MIN_TITLE_CHARS} characters at least).",
            field="title",
        )

    return SubmissionFields(
        first_name=first,
        last_name=last,
        email=normalized_email,
        department=dept,
        title=project_title,
        technologies=_list(technologies, label="Technologies", name="technologies"),
        contributors=_list(contributors, label="Contributors", name="contributors"),
        warning=email_warning(normalized_email),
    )


# --- admin edits ---------------------------------------------------------------------------
#
# An admin is trusted to publish, not to be careful with the database, so the same rules apply
# again on this path: a title that is 400 characters long breaks the Explore grid just as reliably
# when an admin typed it. `src/lib/admin-form.ts` mirrors these for the editor form.

# Control characters, minus tab and newline, which are structure in Markdown rather than junk.
_BODY_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_NOT_IN_A_SLUG = re.compile(r"[^a-z0-9]+")


def slug_from(text: str) -> str:
    """The admin-facing slugifier: `Grading Lab Reports!` -> `grading-lab-reports`.

    Deliberately forgiving about punctuation and about the capital letters people paste, because the
    alternative (an error for every `#`) means an admin gives up on the address. What cannot be
    rescued is refused by `normalize_slug` below.
    """
    return _NOT_IN_A_SLUG.sub("-", text.strip().lower()).strip("-")


def normalize_slug(value: str | None) -> str:
    """A web address an admin asked for, or a SubmissionError saying what is wrong with it."""
    slug = slug_from(value or "")
    if not slug:
        raise SubmissionError(
            "That web address has nothing writable in it — use letters and numbers, with dashes "
            "between the words.",
            field="slug",
        )
    if len(slug) < MIN_SLUG_CHARS:
        raise SubmissionError(
            f"A web address needs at least {MIN_SLUG_CHARS} characters.", field="slug"
        )
    if len(slug) > MAX_SLUG_CHARS:
        raise SubmissionError(
            f"A web address must be {MAX_SLUG_CHARS} characters or fewer (that one is "
            f"{len(slug)}). Keep it to a few words.",
            field="slug",
        )
    return slug


def normalize_body_markdown(value: str | None, *, max_body_chars: int) -> str:
    """Markdown typed by an admin. Rendered and sanitized again on every read, so this only checks
    that it is storable — it is not where the XSS defence lives."""
    text = _BODY_CONTROL_CHARS.sub(" ", (value or "")).replace("\r\n", "\n").replace("\r", "\n")
    text = text.strip()
    if len(text) > max_body_chars:
        raise SubmissionError(
            f"That body is {len(text):,} characters; the cap is {max_body_chars:,}. Split the "
            "write-up into two projects, or trim it down.",
            field="body_markdown",
        )
    return text


def normalize_project_edit(
    changes: dict[str, object], *, max_body_chars: int
) -> dict[str, object]:
    """Validate the fields an admin actually sent, returning column names to bind into SQL.

    `changes` comes from `AdminProjectEdit.model_dump(exclude_unset=True)`, so "absent" (leave the
    column alone) and "explicit null" are already distinguished by this point. Unknown keys are
    ignored rather than trusted: this returns the settable columns, nothing else.
    """
    values: dict[str, object] = {}

    if "title" in changes:
        title = _required_text(
            str(changes["title"] or ""), label="Title", maximum=MAX_TITLE_CHARS, name="title"
        )
        if len(title) < MIN_TITLE_CHARS:
            raise SubmissionError(
                f"A title has to be at least {MIN_TITLE_CHARS} characters — it is what people "
                "browse by.",
                field="title",
            )
        values["title"] = title

    if "department" in changes:
        values["department"] = _required_text(
            str(changes["department"] or ""),
            label="Department or unit",
            maximum=MAX_DEPARTMENT_CHARS,
            name="department",
        )

    if "technologies" in changes:
        values["technologies"] = _list(
            _as_list(changes["technologies"]), label="Technologies", name="technologies"
        )

    if "contributors" in changes:
        values["contributors"] = _list(
            _as_list(changes["contributors"]), label="Contributors", name="contributors"
        )

    if "body_markdown" in changes:
        values["body_markdown"] = normalize_body_markdown(
            None if changes["body_markdown"] is None else str(changes["body_markdown"]),
            max_body_chars=max_body_chars,
        )

    if "slug" in changes:
        values["slug"] = normalize_slug(
            None if changes["slug"] is None else str(changes["slug"])
        )

    return values


def _as_list(value: object) -> list[str] | None:
    """A JSON array of strings, or one comma-separated string — both mean the same thing here."""
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [str(item) for item in value]
    raise SubmissionError(
        "That list did not arrive as a list.", field="technologies"
    )  # pragma: no cover - pydantic rejects it first

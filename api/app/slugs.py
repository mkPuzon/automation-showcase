"""Slug helpers: `<title-slug>-<YYYY-MM-DD>-<short-id>`, generated server-side."""

import re
import secrets
from datetime import date

_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def slugify(text: str) -> str:
    slug = _NON_ALNUM.sub("-", text.lower()).strip("-")
    return slug or "project"


def short_id() -> str:
    """4 hex chars, appended so two titles on the same day never collide."""
    return secrets.token_hex(2)


def build_slug(title: str, created_on: date, suffix: str | None = None) -> str:
    return f"{slugify(title)}-{created_on:%Y-%m-%d}-{suffix or short_id()}"

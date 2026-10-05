"""`.docx` -> stored Markdown.

    mammoth (docx -> HTML, our style_map) -> bleach (drop anything unexpected) -> markdownify

Two things are deliberate here:

* **Never `mammoth.convert_to_markdown`** — python-mammoth documents its Markdown output as
  deprecated. Its HTML output is the supported path, so we go through that and convert ourselves.
* **Images are dropped** in the MVP (see "Known simplifications" in TODO.md). mammoth inlines them
  as base64 `data:` URIs, which would put hundreds of KB of noise in a text column for something
  the renderer would strip anyway (`app/rendering.py` has no `<img>` in its allow-list).

The stored Markdown may contain literal `<script>` text when a writer typed those words in their
document — that is *text*. It is neutralised at read time by `app/rendering.py`, which renders with
raw HTML disabled and then sanitizes.
"""

from __future__ import annotations

import io
import re
import zipfile
from typing import Final

import bleach
import mammoth
from markdownify import markdownify

# Google Docs exports and hand-made Word files disagree about style names, and mammoth's style map
# matches on the *name*. Heading 1/2/3 -> # / ## / ### is the whole point of this mapping: without
# it a "Heading 2" written in Word can arrive as a plain paragraph.
STYLE_MAP: Final[str] = """
p[style-name='Heading 1'] => h1:fresh
p[style-name='Heading 2'] => h2:fresh
p[style-name='Heading 3'] => h3:fresh
p[style-name='Heading 4'] => h4:fresh
p[style-name='Heading 5'] => h5:fresh
p[style-name='Heading 6'] => h6:fresh
p[style-name='Title'] => h1:fresh
p[style-name='Subtitle'] => p:fresh
p[style-name='Quote'] => blockquote:fresh
p[style-name='Intense Quote'] => blockquote:fresh
r[style-name='Code'] => code:fresh
r[style-name='HTML Preformatted'] => code:fresh
"""

# What may survive between mammoth and markdownify. Anything else (script/style/iframe, every
# style= and on*= attribute, and <img>) is stripped before it can become stored Markdown.
DOCX_ALLOWED_TAGS: Final[list[str]] = [
    "p",
    "br",
    "hr",
    "strong",
    "b",
    "em",
    "i",
    "s",
    "strike",
    "del",
    "u",
    "code",
    "pre",
    "kbd",
    "blockquote",
    "ul",
    "ol",
    "li",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "a",
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "th",
    "td",
    "caption",
    "sup",
    "sub",
]

DOCX_ALLOWED_PROTOCOLS: Final[list[str]] = ["http", "https", "mailto"]

DOCX_ALLOWED_ATTRIBUTES: Final[dict[str, list[str]]] = {"a": ["href", "title"]}

DEFAULT_MAX_BODY_CHARS: Final[int] = 200_000

# Markdown punctuation stripped before the "is there actually anything here?" test.
_PLAIN_TEXT = re.compile(r"[\s#*\->`|_~\[\]()!:;.]+")

# Below this many characters of real prose we call the document empty rather than short.
MIN_PLAIN_TEXT_CHARS: Final[int] = 24

# The file has to be a WordprocessingML package; this is the type Word/Google Docs put on it.
DOCX_CONTENT_TYPES: Final[frozenset[str]] = frozenset(
    {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        # Browsers and `curl` are inconsistent about it, and we check the extension anyway.
        "application/octet-stream",
        "",
    }
)


class DocxError(Exception):
    """Unusable upload. `.message` is safe to show the submitter — it never quotes the document."""

    def __init__(self, message: str, *, field: str = "document") -> None:
        super().__init__(message)
        self.message = message
        self.field = field


def _drop_image(_image) -> str:
    """mammoth `convert_image` hook: return text (empty) instead of an <img> with a data: URI."""
    return ""


def _assert_docx_container(data: bytes) -> None:
    """A .docx is a zip with a `word/document.xml` part — say so before mammoth guesses.

    mammoth's own failure for the common cases (a renamed .txt, a truncated download, an .odt) is a
    bare OSError, which is useless as a message. The container check is cheap and precise.
    """
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            names = archive.namelist()
    except (zipfile.BadZipFile, OSError) as exc:
        raise DocxError(
            "That file is not a .docx document. In Google Docs use File > Download > Microsoft "
            "Word (.docx) and upload that."
        ) from exc
    if "word/document.xml" not in names:
        raise DocxError(
            "That .docx has no document part in it — it looks like a partial download or a "
            "different Office file. Export it again and retry."
        )
    if "[Content_Types].xml" not in names:
        raise DocxError("That .docx is missing its package manifest, so it cannot be read.")


def _sanitize_html(html: str) -> str:
    return bleach.clean(
        html,
        tags=DOCX_ALLOWED_TAGS,
        attributes=DOCX_ALLOWED_ATTRIBUTES,
        protocols=DOCX_ALLOWED_PROTOCOLS,
        strip=True,
    )


def _to_markdown(html: str) -> str:
    markdown = markdownify(
        html,
        heading_style="ATX",
        bullets="-",
        strip=["img"],  # belt-and-braces: nothing image-shaped should be left
        # Filenames are the currency of these write-ups (`clean_sensors.py`, `post_directory.py`).
        # Escaping every underscore makes the stored Markdown painful to read in the admin textarea
        # for a risk — an odd count of `_` turning into emphasis — that is rare and visible.
        escape_underscores=False,
    )
    markdown = re.sub(r"[ \t]+\n", "\n", markdown)
    markdown = re.sub(r"\n{3,}", "\n\n", markdown)
    return markdown.strip()


def html_to_markdown(html: str) -> str:
    """Sanitize mammoth's HTML and convert it to the Markdown we store."""
    return _to_markdown(_sanitize_html(html))


def docx_to_markdown(
    data: bytes,
    *,
    max_body_chars: int = DEFAULT_MAX_BODY_CHARS,
) -> str:
    """Parse `.docx` bytes into sanitized Markdown.

    Raises:
        DocxError: not a .docx, unreadable, or it contains nothing worth publishing.
    """
    if not data:
        raise DocxError("The uploaded file is empty.")

    _assert_docx_container(data)

    try:
        result = mammoth.convert_to_html(
            io.BytesIO(data),
            style_map=STYLE_MAP,
            convert_image=_drop_image,
        )
    except Exception as exc:  # a corrupt part, an exotic element, an unreadable stream
        raise DocxError(
            "That .docx could not be read. Try re-downloading it from Google Docs and uploading "
            "again; if it keeps failing, send the write-up to Computing Services."
        ) from exc

    markdown = html_to_markdown(result.value)

    if len(markdown) > max_body_chars:
        raise DocxError(
            f"That document is too long for the site ({len(markdown):,} characters; the cap is "
            f"{max_body_chars:,}). Split it into two write-ups, or trim it down."
        )

    if len(_PLAIN_TEXT.sub("", markdown)) < MIN_PLAIN_TEXT_CHARS:
        raise DocxError(
            "No written-up content was found in that document. It needs at least a paragraph of "
            "text before it can be reviewed."
        )

    return markdown

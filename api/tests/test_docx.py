"""The `.docx` -> Markdown pipeline, run against the checked-in fixtures.

DB-free on purpose: this is the module that turns someone else's Word file into what the site
renders, so it should be testable in a second. Regenerate the fixtures with
`uv run --with python-docx python tests/tools/make_docx_fixtures.py` if you change them.

Run: cd api && uv run pytest
"""

from __future__ import annotations

import re

import pytest

from app.docx import DocxError, docx_to_markdown, html_to_markdown
from app.rendering import ALLOWED_TAGS, render_markdown

from .helpers import read_fixture

_TAG = re.compile(r"<\s*/?\s*([a-zA-Z0-9]+)((?:\s+[a-zA-Z0-9:_-]+(?:\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+))?)*)\s*/?>")


@pytest.fixture(scope="module")
def markdown() -> str:
    return docx_to_markdown(read_fixture("writeup.docx"))


def test_headings_become_atx_markdown(markdown: str):
    assert markdown.startswith("# Cleaning Up Watershed Sensor Exports Before Class")
    assert "## What you need" in markdown
    assert "## Files" in markdown
    assert "### Gotchas" in markdown
    # no HTML left over from mammoth's intermediate output
    assert "<h1>" not in markdown and "<p>" not in markdown


def test_inline_formatting_and_lists_survive(markdown: str):
    assert "**sensor share**" in markdown
    assert "*Python 3.12 or newer*" in markdown
    # bullet list (our bullets="-") and numbered list
    assert "- Download the export into ~/sensors/inbox." in markdown
    assert re.search(r"^1\. Check the headers\.$", markdown, re.MULTILINE)


def test_tables_and_links_survive(markdown: str):
    # markdownify keeps the grid (the header row is empty because Word tables here have no header
    # flag), and filenames stay readable rather than arriving as `clean\_sensors.py`.
    assert "| File | Purpose |" in markdown
    assert "clean_sensors.py" in markdown
    assert "sensors.csv" in markdown
    assert "[the Colby field-equipment page](https://www.colby.edu/field-equipment)" in markdown


def test_images_are_stripped_not_inlined(markdown: str):
    """mammoth would otherwise hand us a base64 data: URI per picture."""
    assert "![" not in markdown
    assert "data:image" not in markdown
    assert '<img src="' not in markdown
    # ...but the sentence around the picture is still there
    assert "This is what a bad export looks like:" in markdown


def test_markup_typed_as_text_cannot_execute(markdown: str):
    """Someone typing `<script>` in their write-up must not become a script tag on the page."""
    assert "<script>alert(1)</script>" in markdown  # stored as literal text

    html = render_markdown(markdown)
    for name, attrs in _TAG.findall(html):
        assert name.lower() in ALLOWED_TAGS
        assert not re.search(r"\son[a-z]+\s*=", attrs, re.IGNORECASE)
    assert "<script" not in html
    assert "&lt;script&gt;" in html


def test_empty_document_is_rejected():
    with pytest.raises(DocxError) as exc:
        docx_to_markdown(read_fixture("empty.docx"))
    assert "empty" in exc.value.message.lower() or "content" in exc.value.message.lower()


def test_non_docx_bytes_are_rejected():
    for payload in (read_fixture("not-a-docx.docx"), b"", b"\x00\x01garbage", b"PK\x03\x04"):
        with pytest.raises(DocxError):
            docx_to_markdown(payload)


def test_body_over_the_character_cap_is_rejected():
    with pytest.raises(DocxError) as exc:
        docx_to_markdown(read_fixture("writeup.docx"), max_body_chars=200)
    assert "too long" in exc.value.message


def test_html_to_markdown_drops_tags_we_never_want():
    out = html_to_markdown(
        '<p onclick="steal()">Safe words</p>'
        '<script>alert(1)</script>'
        '<img src="https://evil.test/x.png">'
        '<a href="javascript:alert(1)">bad link</a>'
        '<a href="https://www.colby.edu/">good link</a>'
    )
    assert "Safe words" in out
    assert "onclick" not in out
    assert "![" not in out
    assert "evil.test" not in out
    assert "javascript:" not in out
    assert "[good link](https://www.colby.edu/)" in out

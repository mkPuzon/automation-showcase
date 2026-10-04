"""The sanitizer is the one place untrusted .docx output becomes HTML — DB-free on purpose.

Run: cd api && uv run pytest
"""

import re

from app.rendering import ALLOWED_TAGS, render_markdown

# Real (unescaped) tags only: escaped payloads sit in the text as &lt;script&gt;.
_TAG = re.compile(r"<\s*/?\s*([a-zA-Z0-9]+)((?:\s+[a-zA-Z0-9:_-]+(?:\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+))?)*)\s*/?>")


def _live_tags(html: str) -> list[tuple[str, str]]:
    return [(name.lower(), attrs.lower()) for name, attrs in _TAG.findall(html)]


def test_raw_html_never_survives():
    for payload in (
        "<script>alert(1)</script>",
        "<img src=x onerror=alert(1)>",
        "<iframe src='https://evil.test'></iframe>",
        "<p onclick='bad()'>hi</p>",
        "<svg><animate onbegin=alert(1)></svg>",
    ):
        out = render_markdown(payload)
        for name, attrs in _live_tags(out):
            assert name in ALLOWED_TAGS, (payload, name)
            assert not re.search(r"\son[a-z]+\s*=", attrs), (payload, attrs)
            assert "src" not in attrs, (payload, attrs)
        # the payload stays readable, as escaped text
        assert "&lt;" in out


def test_javascript_urls_never_become_links():
    out = render_markdown("[x](javascript:alert(1)) <a href='vbscript:msgbox(1)'>y</a>")
    assert "<a" not in out
    for _name, attrs in _live_tags(out):
        assert not re.search(r"(javascript|vbscript|data)\s*:", attrs)


def test_links_open_safely():
    out = render_markdown("[roster sheet](https://sheets.example.com/a_b)")
    assert 'href="https://sheets.example.com/a_b"' in out
    assert 'target="_blank"' in out
    assert "noopener" in out and "noreferrer" in out


def test_allowed_structure_survives():
    out = render_markdown(
        """# Title

Some **bold** and `code`.

- one
- two

| a | b |
| - | - |
| 1 | 2 |

> note

```sh
echo hi
```
"""
    )
    for fragment in (
        "<h1>Title</h1>",
        "<strong>bold</strong>",
        "<code>code</code>",
        "<li>one</li>",
        "<table>",
        "<blockquote>",
        "<pre><code",
    ):
        assert fragment in out, fragment


def test_empty_input_is_empty_output():
    assert render_markdown("") == ""

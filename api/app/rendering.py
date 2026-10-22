"""Stored Markdown -> sanitized HTML for the frontend.

Markdown is the storage format (admin edits it in a plain textarea). On read we render with
markdown-it-py with raw HTML disabled, then sanitize again with bleach as a belt-and-braces
step. `<img>` is not in the allow-list, so image refs from .docx never reach the page.

The frontend does *not* re-sanitize from scratch — it re-checks this output before injecting it
(see `src/lib/markdown.ts`), so keep the two allow-lists in step when changing either.
"""

import bleach
import markdown_it

_markdown = markdown_it.MarkdownIt("commonmark", {"html": False}).enable(
    ["table", "strikethrough"]
)

ALLOWED_TAGS = [
    "p",
    "br",
    "hr",
    "strong",
    "em",
    "b",
    "i",
    "s",
    "del",
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
    "img",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
]

ALLOWED_PROTOCOLS = ["http", "https", "mailto"]

# Rendered links open in a new tab and cannot reach window.opener (every write-up was authored by
# someone else, so treat each link as third-party). markdown-it sets these; bleach then only
# re-admits them if they still look like what we set.
LINK_REL = "noopener noreferrer nofollow"

ALLOWED_ATTRIBUTES: dict[str, list[str]] = {
    "a": ["href", "title", "target", "rel"],
    "img": ["src", "alt"],
    "th": ["align"],
    "td": ["align"],
}

TABLE_ALIGNMENTS = {"left", "right", "center", "justify"}
REL_TOKENS = {"noopener", "noreferrer", "nofollow"}


def _attributes(tag: str, name: str, value: str) -> bool:
    """bleach attribute gate (bleach 6 uses the return value as a yes/no, not a rewrite)."""
    if name not in ALLOWED_ATTRIBUTES.get(tag, []):
        return False
    if name == "target":
        return value.strip() == "_blank"
    if name == "rel":
        tokens = {token.lower() for token in value.split()}
        return bool(tokens) and tokens <= REL_TOKENS and "noopener" in tokens
    if name == "align":
        return value in TABLE_ALIGNMENTS
    return True


def _link_open(renderer, tokens, idx, options, ctx) -> str:
    tokens[idx].attrSet("target", "_blank")
    tokens[idx].attrSet("rel", LINK_REL)
    return renderer.renderToken(tokens, idx, options, ctx)


_markdown.add_render_rule("link_open", _link_open)


def render_markdown(source: str) -> str:
    """Render stored Markdown to a safe HTML fragment."""
    html = _markdown.render(source or "")
    return bleach.clean(
        html,
        tags=ALLOWED_TAGS,
        attributes=_attributes,
        protocols=ALLOWED_PROTOCOLS,
        strip=True,
    )

"""Submission metadata rules — the server-side half of locked decision #8.

Run: cd api && uv run pytest
"""

from __future__ import annotations

import pytest

from app.validate import (
    MAX_LIST_ITEMS,
    MAX_TITLE_CHARS,
    ODD_LOCAL_PART_WARNING,
    SubmissionError,
    email_warning,
    normalize_submission,
)

BASE = {
    "first_name": "Jessie",
    "last_name": "Chen",
    "email": "jchen@colby.edu",
    "department": "Computational Science",
    "title": "Grading 120 lab reports with a rubric macro",
}


def submit(**overrides):
    return normalize_submission(**{**BASE, **overrides})


def test_a_normal_submission_passes_through_normalized():
    fields = submit(email="  JChen@Colby.Edu ", first_name="  Jessie  ", technologies=["Python"])
    assert fields.email == "jchen@colby.edu"
    assert fields.first_name == "Jessie"
    assert fields.technologies == ["Python"]
    assert fields.warning is None


@pytest.mark.parametrize("email", ["letters@colby.edu", "first.last@colby.edu", "mdubois@colby.edu"])
def test_conventional_colby_addresses_pass_without_a_warning(email: str):
    fields = submit(email=email)
    assert fields.email == email
    assert fields.warning is None


@pytest.mark.parametrize("email", ["jchen24@colby.edu", "sl-help@colby.edu", "a_b@colby.edu"])
def test_odd_local_parts_submit_with_a_soft_warning(email: str):
    """Decision #8: unusual local part = a note, never a rejection."""
    fields = submit(email=email)
    assert fields.email == email
    assert fields.warning == ODD_LOCAL_PART_WARNING
    assert email_warning(email) == ODD_LOCAL_PART_WARNING


@pytest.mark.parametrize(
    "email",
    [
        "",
        "someone@gmail.com",
        "jchen@bowdoin.edu",
        "jchen@colby.edu.attacker.test",
        "jchen@colby",
        "not an address",
        "jchen@colby.edu extra",
    ],
)
def test_anything_outside_colby_edu_is_rejected(email: str):
    with pytest.raises(SubmissionError) as exc:
        submit(email=email)
    assert exc.value.field == "email"
    assert "colby" in exc.value.message.lower()


@pytest.mark.parametrize("missing", ["first_name", "last_name", "department", "title"])
def test_required_fields_say_which_one_is_missing(missing: str):
    with pytest.raises(SubmissionError) as exc:
        submit(**{missing: "   "})
    assert exc.value.field == missing


def test_title_and_name_length_limits():
    with pytest.raises(SubmissionError):
        submit(title="x" * (MAX_TITLE_CHARS + 1))
    with pytest.raises(SubmissionError):
        submit(first_name="y" * 200)
    with pytest.raises(SubmissionError):
        submit(title="Fix")  # too short to browse by


def test_lists_are_split_deduplicated_and_capped():
    fields = submit(
        technologies=["Python, pandas", "python", " Google Sheets ", ""],
        contributors=["Karen Vreeland,karen vreeland"],
    )
    assert fields.technologies == ["Python", "pandas", "Google Sheets"]
    assert fields.contributors == ["Karen Vreeland"]

    with pytest.raises(SubmissionError):
        submit(technologies=[f"tool {i}" for i in range(MAX_LIST_ITEMS + 1)])

    with pytest.raises(SubmissionError):
        submit(technologies=["a" * 200])


def test_control_characters_are_not_stored():
    fields = submit(title="Rubric macro\x00 then some more words")
    assert "\x00" not in fields.title

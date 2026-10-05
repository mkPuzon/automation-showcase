"""The admin session token: the format, the signature, the expiry. No database needed.

`app/auth.py` verifies tokens that `src/lib/admin-session.ts` signs, so the wire format is the
contract between two languages. `GOLDEN_TOKEN` below is the payload/secret pair that
`src/lib/admin-session.spec.ts` pins from the other side: if either implementation changes how it
signs, one of the two suites goes red.

Run: cd api && uv run pytest
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
from datetime import UTC, datetime

import pytest
from fastapi import HTTPException

from app.auth import (
    NOT_CONFIGURED,
    REJECTED,
    SessionError,
    bearer_token,
    require_admin,
    verify_session_token,
)
from app.config import get_settings

from .helpers import ADMIN_SECRET as SECRET, sign_claims

GOLDEN_TOKEN = (
    "eyJzdWIiOiJhZG1pbiIsImlhdCI6MTc3MDAwMDAwMCwiZXhwIjoxNzcwMDI4ODAwfQ"
    ".LEd4Dw_fnKuX0KEX964fD03DtH7HJiOMqlnoH56LIjE"
)  # sub=admin, iat=1770000000, exp=1770028800, signed with SECRET - pinned again in src/lib/admin-session.spec.ts
GOLDEN_NOW = datetime(2026, 2, 2, 4, 0, tzinfo=UTC)  # inside that token's 8h window


def sign(claims: object, secret: str = SECRET) -> str:
    return sign_claims(claims, secret=secret)


def token(*, secret: str = SECRET, **claims) -> str:
    """A token with the usual claims, one override at a time."""
    return sign({"sub": "admin", "iat": 1_770_000_000, "exp": 1_770_028_800, **claims}, secret)


def test_the_golden_vector_verifies():
    session = verify_session_token(GOLDEN_TOKEN, SECRET, now=GOLDEN_NOW)
    assert session.issued_at == 1_770_000_000
    assert session.expires_at == 1_770_028_800


def test_a_token_we_signed_ourselves_verifies():
    assert verify_session_token(token(), SECRET, now=GOLDEN_NOW).expires_at == 1_770_028_800


@pytest.mark.parametrize(
    "candidate, reason",
    [
        (token(secret="the-other-secret-everyone-uses"), "another secret's signature"),
        (GOLDEN_TOKEN.replace(".LE", ".le"), "lowercased signature"),
        (GOLDEN_TOKEN.split(".")[0], "no signature at all"),
        (GOLDEN_TOKEN + ".extra", "a third field"),
        ("", "empty"),
        (".", "two empty fields"),
        ("not-a-token", "no dot"),
        ("!!!.!!!", "base64url that is not"),
        (f"{'a' * 400}.{'b' * 400}", "absurdly long"),
    ],
)
def test_a_token_we_did_not_sign_is_rejected(candidate, reason):
    with pytest.raises(SessionError) as exc:
        verify_session_token(candidate, SECRET, now=GOLDEN_NOW)
    assert exc.value.status == 401, reason
    assert exc.value.message == REJECTED, "the reason a token failed is not for the caller"


def test_the_payload_cannot_be_edited_under_the_signature():
    """Change one claim and the signature stops matching — that is the whole design."""
    forged = token(sub="admin", iat=1_770_000_000, exp=9_999_999_999)
    with pytest.raises(SessionError):
        verify_session_token(forged, SECRET, now=GOLDEN_NOW)


@pytest.mark.parametrize(
    "claims",
    [
        {"sub": "someone-else", "iat": 1_770_000_000, "exp": 1_770_028_800},
        {"iat": 1_770_000_000, "exp": 1_770_028_800},
        {"sub": "admin", "iat": "1770000000", "exp": 1_770_028_800},
        {"sub": "admin", "iat": 1_770_000_000, "exp": 1_770_000_000 + 999_999_999},
        {"sub": "admin", "iat": 1_770_000_000},
    ],
)
def test_claims_we_would_never_write_are_rejected(claims):
    with pytest.raises(SessionError):
        verify_session_token(sign(claims), SECRET, now=GOLDEN_NOW)


def test_a_json_document_is_not_a_claims_object():
    payload = base64.urlsafe_b64encode(b"[1,2,3]").rstrip(b"=").decode()
    digest = hmac.new(
        SECRET.encode(), f"techshare-admin.v1.{payload}".encode(), hashlib.sha256
    ).digest()
    with pytest.raises(SessionError):
        verify_session_token(
            f"{payload}.{base64.urlsafe_b64encode(digest).rstrip(b'=').decode()}",
            SECRET,
            now=GOLDEN_NOW,
        )


def test_expiry_is_the_end_of_the_session():
    claims = {"sub": "admin", "iat": 1_770_000_000, "exp": 1_770_028_800}
    just_before = datetime.fromtimestamp(claims["exp"] - 1, UTC)
    assert verify_session_token(sign(claims), SECRET, now=just_before)

    with pytest.raises(SessionError) as exc:
        verify_session_token(sign(claims), SECRET, now=datetime.fromtimestamp(claims["exp"], UTC))
    assert "expired" in exc.value.message.lower()


def test_a_clock_in_the_future_does_not_extend_anything():
    """`iat` ahead of now means the token did not come from this pair of processes."""
    future = {"sub": "admin", "iat": 2_000_000_000, "exp": 2_000_008_800}
    with pytest.raises(SessionError):
        verify_session_token(sign(future), SECRET, now=GOLDEN_NOW)


def test_no_secret_means_no_admin():
    """An unset SESSION_SECRET must not turn "signed with nothing" into a working credential."""
    with pytest.raises(SessionError) as exc:
        verify_session_token(GOLDEN_TOKEN, "   ", now=GOLDEN_NOW)
    assert exc.value.status == 503
    assert exc.value.message == NOT_CONFIGURED


@pytest.mark.parametrize(
    "header, expected",
    [
        ("Bearer abc.def", "abc.def"),
        ("bearer abc.def", "abc.def"),  # the scheme is case-insensitive
        ("  Bearer   abc.def  ", "abc.def"),
        ("Token abc.def", ""),
        ("Bearer", ""),
        ("", ""),
        (None, ""),
    ],
)
def test_the_bearer_header_is_read_the_same_way_every_time(header, expected):
    assert bearer_token(header) == expected


@pytest.fixture
def session_secret(monkeypatch):
    """Make the test secret the configured one for the length of one test.

    Settings are read once and cached, the way the running API reads them, so both halves have to be
    touched: the environment, and the cache that would otherwise hide it.
    """
    monkeypatch.setenv("SESSION_SECRET", SECRET)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_the_dependency_demands_a_token(session_secret):
    with pytest.raises(HTTPException) as exc:
        dependency(None)
    assert exc.value.status_code == 401
    assert exc.value.detail == REJECTED


def test_the_dependency_accepts_a_live_token_and_refuses_a_foreign_one(session_secret):
    # The dependency checks the real clock, so this one has to be minted for now, not for the
    # golden vector's window.
    moment = int(datetime.now(UTC).timestamp())
    live = sign({"sub": "admin", "iat": moment, "exp": moment + 8 * 3600})

    session = dependency(f"Bearer {live}")
    assert session.expires_at == moment + 8 * 3600

    with pytest.raises(HTTPException) as exc:
        dependency(f"Bearer {token(secret='someone-elses-secret')}")
    assert exc.value.status_code == 401

    with pytest.raises(HTTPException) as exc:
        dependency(f"Bearer {GOLDEN_TOKEN}")  # correctly signed, long out of date
    assert exc.value.status_code == 401
    assert "expired" in exc.value.detail.lower()


def test_the_dependency_refuses_everything_when_no_secret_is_configured(monkeypatch):
    """503, not 401: an unset SESSION_SECRET is our fault, not the caller's."""
    monkeypatch.setenv("SESSION_SECRET", "")
    get_settings.cache_clear()
    try:
        with pytest.raises(HTTPException) as exc:
            dependency(f"Bearer {GOLDEN_TOKEN}")
        assert exc.value.status_code == 503
        assert exc.value.detail == NOT_CONFIGURED
    finally:
        get_settings.cache_clear()


def dependency(header: str | None):
    """`require_admin` is async, and pytest-asyncio is not a dependency of this project."""
    return asyncio.run(require_admin(header))

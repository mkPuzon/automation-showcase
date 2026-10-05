"""Verifying the admin session token that SvelteKit signs (locked decision #6).

There is no login route here, deliberately: FastAPI never talks to a browser. SvelteKit checks
`ADMIN_PASSWORD`, signs an 8-hour token with `SESSION_SECRET`, puts it in an HttpOnly `/admin`
cookie, and forwards it to this API as `Authorization: Bearer <token>`. This module answers one
question — *is that a token we would have signed, and is it still in date?*

The wire format is shared with `src/lib/admin-session.ts` and pinned by the same golden vector in
both suites (`api/tests/test_auth.py`, `src/lib/admin-session.spec.ts`):

    token    = <base64url(json)> + "." + <base64url(hmac_sha256)>
    signed   = "techshare-admin.v1." + <base64url(json)>
    json     = {"sub":"admin","iat":<epoch seconds>,"exp":<epoch seconds>}

base64url *without* padding, because that is what Node's `digest("base64url")` produces. Change the
format in one implementation only and the other suite fails; change it in both and every live admin
cookie stops verifying — which is the safe direction for it to fail in.

Nothing here is a session store: a token is valid until `exp`, so logout cannot revoke one early
(listed under "Known simplifications" in TODO.md).
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Header, HTTPException

from .config import get_settings

SIGNATURE_PREFIX = "techshare-admin.v1."
SESSION_SUBJECT = "admin"
SESSION_TTL_SECONDS = 8 * 3600
# Two base64url fields is all this format can be; anything longer did not come from us.
MAX_TOKEN_CHARS = 512
# A token may not outlive the agreed TTL (plus a minute of clock slack between the two services).
MAX_TTL_SECONDS = SESSION_TTL_SECONDS + 60

NOT_CONFIGURED = "Admin access is not configured on this server."
# One sentence for "no token", "wrong signature" and "expired": why a token failed is not for the
# caller to learn, and the only caller (SvelteKit) sends us a valid one or sends us nothing.
REJECTED = "A current admin session is required."


class SessionError(Exception):
    """The token is not one we would have signed. `.message` is safe to show the caller."""

    def __init__(self, message: str = REJECTED, *, status: int = 401) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


@dataclass(frozen=True)
class AdminSession:
    """A verified token, reduced to what the rest of the API has any use for."""

    issued_at: int
    expires_at: int

    @property
    def remaining_seconds(self) -> int:
        return self.expires_at - int(datetime.now(UTC).timestamp())


def _b64url_encode(data: bytes) -> str:
    # Node's digest("base64url") emits no padding, so neither do we.
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _signature(secret: str, payload: str) -> str:
    return _b64url_encode(
        hmac.new(secret.encode(), (SIGNATURE_PREFIX + payload).encode(), hashlib.sha256).digest()
    )


def verify_session_token(
    token: str, secret: str, *, now: datetime | None = None
) -> AdminSession:
    """Check the signature and the expiry. Raises `SessionError`; never trusts the payload first."""
    if secret.strip() == "":
        # Without a shared secret nothing can verify, and "no secret" must not read as "any token
        # signed with the empty string is admin".
        raise SessionError(NOT_CONFIGURED, status=503)

    payload, dot, signature = token.partition(".")
    if not dot or not payload or not signature or len(token) > MAX_TOKEN_CHARS:
        raise SessionError

    # Signature before payload: the claims are only interesting once they are known to be ours.
    if not hmac.compare_digest(_signature(secret, payload), signature):
        raise SessionError

    try:
        claims = json.loads(_b64url_decode(payload).decode())
    except (UnicodeDecodeError, binascii.Error, ValueError):
        raise SessionError from None

    if not isinstance(claims, dict) or claims.get("sub") != SESSION_SUBJECT:
        raise SessionError

    issued_at, expires_at = claims.get("iat"), claims.get("exp")
    if not isinstance(issued_at, int) or not isinstance(expires_at, int):
        raise SessionError

    moment = int((now or datetime.now(UTC)).timestamp())
    if expires_at <= moment:
        raise SessionError("That admin session has expired.")
    if issued_at > moment + 60 or expires_at - issued_at > MAX_TTL_SECONDS:
        raise SessionError

    return AdminSession(issued_at=issued_at, expires_at=expires_at)


def bearer_token(authorization: str | None) -> str:
    """The token out of an `Authorization: Bearer <token>` header, or ''."""
    scheme, _, rest = (authorization or "").strip().partition(" ")
    if scheme.lower() != "bearer":
        return ""
    return rest.strip()


async def require_admin(
    authorization: Annotated[str | None, Header()] = None,
) -> AdminSession:
    """FastAPI dependency: every `/api/admin` route runs through this.

    The API port is unpublished, so the only thing that can reach it is SvelteKit server code — but
    the token is still checked, because "behind a proxy" is not a credential.
    """
    token = bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail=REJECTED)
    try:
        return verify_session_token(token, get_settings().session_secret)
    except SessionError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message) from exc

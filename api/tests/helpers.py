"""Test helpers: the fixture files, and the probe that decides whether the database tests can run.

The submission tests need a real Postgres — that is the only honest way to test a two-table
transaction. When the configured `DATABASE_URL` does not answer they skip rather than fail, so
`uv run pytest` still works on a machine with no database running.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from pathlib import Path

import psycopg
import pytest

FIXTURES = Path(__file__).resolve().parent / "fixtures"

# Shared by the admin tests: the `SESSION_SECRET` those tests pretend is configured, the token's
# lifetime, and a signer that does not depend on app/auth.py.
ADMIN_SECRET = "phase4-golden-vector"
SESSION_TTL_SECONDS = 8 * 3600


def read_fixture(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def admin_claims(*, sub: str = "admin", iat: int | None = None, exp: int | None = None) -> dict:
    """The claims a real session carries: who, since when, until when."""
    moment = int(time.time()) if iat is None else iat
    return {"sub": sub, "iat": moment, "exp": moment + SESSION_TTL_SECONDS if exp is None else exp}


def sign_claims(claims: object, *, secret: str = ADMIN_SECRET) -> str:
    """Sign *exactly* these claims, odd or not — which is why the admin tests can ask for a token
    whose `exp` is a string, or missing, or forty years long."""
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).rstrip(b"=")
    digest = hmac.new(secret.encode(), b"techshare-admin.v1." + payload, hashlib.sha256).digest()
    return f"{payload.decode()}.{base64.urlsafe_b64encode(digest).rstrip(b'=').decode()}"


def admin_token(
    *,
    secret: str = ADMIN_SECRET,
    sub: str = "admin",
    iat: int | None = None,
    exp: int | None = None,
) -> str:
    """A session token in the format `src/lib/admin-session.ts` signs (app/auth.py verifies it).

    Built from the outside on purpose — base64url, the JSON, the `techshare-admin.v1.` prefix and the
    HMAC are written here rather than borrowed from the module under test, so a change to the format
    has to be made twice before the suite stops noticing it.
    """
    return sign_claims(admin_claims(sub=sub, iat=iat, exp=exp), secret=secret)


def admin_headers(**kwargs) -> dict[str, str]:
    """`Authorization: Bearer <token>` for the admin routes; keyword args go to `admin_token`."""
    return {"Authorization": f"Bearer {admin_token(**kwargs)}"}


def database_reachable() -> bool:
    """A short, silent probe — collecting tests must not hang when nothing is listening."""
    dsn = os.environ.get("DATABASE_URL") or ""
    if not dsn:
        try:  # fall back to the same env file the API itself reads
            from app.config import get_settings

            dsn = get_settings().database_url
        except Exception:
            return False
    try:
        with psycopg.connect(dsn, connect_timeout=2) as conn:
            conn.execute("SELECT 1")
        return True
    except Exception:
        return False


requires_db = pytest.mark.skipif(
    not database_reachable(),
    reason="no reachable Postgres (see api/tests/helpers.py) - the submission tests need one",
)

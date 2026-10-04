"""Environment-driven settings for the API."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_API_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    # The second entry is the repo-root env file, so `uv run uvicorn` works from api/
    # without exporting anything (docker compose / Dokploy inject real env vars instead).
    model_config = SettingsConfigDict(
        env_file=(".env", str(_API_ROOT.parent / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql://techshare:techshare@localhost:5432/techshare"
    # Shared with SvelteKit: both sign/verify the admin session token with it (Phase 4).
    session_secret: str = ""
    upload_dir: str = "./data/uploads"
    migrations_dir: Path = _API_ROOT / "migrations"


@lru_cache
def get_settings() -> Settings:
    return Settings()

# FastAPI service. `ghcr.io/astral-sh/uv:python3.12-bookworm-slim` is python:3.12-slim with uv on
# PATH, which is the one image that lets us install from uv.lock without a separate toolchain layer.
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH=/opt/venv/bin:$PATH \
    UPLOAD_DIR=/data/uploads

WORKDIR /srv/api

# Dependencies in their own layer: this is the slow part, and it only rebuilds when the lockfile
# changes. `--no-install-project` because this project is packaged (`[tool.uv] package = true`) but
# the container imports `app` straight out of WORKDIR — building a wheel to import the same files
# would just add a build step and a place for drift.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY app ./app
COPY migrations ./migrations

# Non-root. The only thing this process ever writes is the uploads volume, so it gets that one
# directory and nothing else; `uploads` is created *before* it is mounted so the named volume
# inherits this ownership instead of arriving as root.
RUN useradd --uid 10001 --user-group --create-home api \
    && mkdir -p /data/uploads \
    && chown -R api:api /data /srv/api /opt/venv
USER api

EXPOSE 8000

# /api/health answers 503 while the database is unreachable, so this goes unhealthy rather than
# pretending a service with no database is fine.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)" || exit 1

# Migrations are applied by the app on startup (api/app/migrations.py); no separate migrate step.
# One worker on purpose: the pool, the rate limits this service does not own, and the uploads volume
# all behave identically single-process, and the web container is the thing that scales.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

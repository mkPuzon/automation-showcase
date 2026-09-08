# Database migration approach

The API uses SQLAlchemy models as the schema source for the MVP. On startup it
runs `Base.metadata.create_all()` and applies the two additive columns that were
introduced after the initial project table (`reviewed_by` and
`rejection_reason`). This keeps a fresh local Compose database and an existing
MVP database bootable without a separate migration service.

Before the first production schema change, move schema ownership to **Alembic**:

1. Add Alembic to `backend/requirements.txt` and create an `alembic.ini` plus a
   `backend/alembic/` migration directory.
2. Generate a baseline revision from the current `projects` table, including
   `reviewed_by` and `rejection_reason`.
3. Run `alembic upgrade head` as a one-shot deployment/entrypoint step before
   starting Uvicorn.
4. Commit one forward-only, reviewed revision for every subsequent schema
   change. Do not use `create_all()` for production upgrades after the baseline.

The current startup bootstrap is therefore intentionally a local/MVP
compatibility measure, not the long-term production migration mechanism. Tests
use an isolated SQLite database and create the model schema directly; they do
not change or bypass the production migration decision.

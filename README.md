# Colby Automation Showcase

A small internal showcase for Colby staff and faculty to share how they use automation tools to make their work less tedious and spend more time on what matters.

## Current state

The project now has a minimal Svelte frontend connected to the FastAPI/PostgreSQL stack through Docker Compose. It is intentionally plain and focused on making the main workflows clickable.

Implemented:

- Minimal Explore page at `http://localhost:5173/`
- Project detail pages at `/projects/{slug}`
- Submission form at `http://localhost:5173/submit`
- Admin login and editing page at `http://localhost:5173/admin` (not linked in the public navigation)
- PostgreSQL-backed projects
- Project submission API
- Staff email validation using the `letters@colby.edu` convention
- Project fields for title, Markdown description, contributors, tools, department, and submitter email
- `pending`, `approved`, and `rejected` project statuses
- Public API that exposes approved projects only
- Individual project detail slugs based on project title, submission date, and a collision-safe ID
- Admin password login using an HttpOnly cookie
- Admin project editing, status changes, and deletion
- Sanitized Markdown rendering, including links and images
- Seven local seed projects (six approved and one pending)
- Separate production-style and local Docker Compose files

Not implemented yet:

- Production authentication beyond the temporary shared admin password

Image uploads are now supported for submissions and admin edits. PNG and JPG files up to
5 MB each can be inserted into a Markdown description, with a maximum of 10 images per
project. The API stores them in the persistent `uploads_data` volume (or the local
`./uploads` bind mount) and exposes them only after the project is approved. Unsubmitted
draft images older than 24 hours are removed when the API starts; deleted project images
are removed immediately. PDFs are still parsed only as temporary drafts and are never stored.

The backend API regression suite is in `backend/tests/` and runs with `pytest`. The
migration decision and future Alembic handoff are documented in
[`backend/MIGRATIONS.md`](./backend/MIGRATIONS.md).

See [`TODO.md`](./TODO.md) for the product plan, remaining work, and open decisions.

## Tech stack

- Frontend: SvelteKit
- Backend: FastAPI
- Database: PostgreSQL 16
- Containerization: Docker Compose

## Run locally

### Requirements

- Docker Desktop or Docker Engine with the Compose plugin
- Node.js and npm only if running the Svelte frontend outside Docker

### Start the API and database

The local Compose override maps the API to `localhost:8000`, enables seven seed projects, and uses `local-admin` as the default admin password.


The API is available at:

- Website: <http://localhost:5173>
- API base: <http://localhost:8000>
- API status: <http://localhost:8000/>
- Interactive API docs: <http://localhost:8000/docs>
- Health check: <http://localhost:8000/api/health>

To run in the background:

```sh
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

To stop the services:

```sh
docker compose -f docker-compose.yml -f docker-compose.local.yml down
```

### Configure local environment values

The local override has safe development defaults. To customize them, copy the example file and edit it:

```sh
cp .env.example .env
```

At minimum, change `ADMIN_PASSWORD` if the API will be accessible beyond your own machine. The `.env` file is intentionally not committed. Compose passes this value directly to the API container; after changing it, recreate the API container so it receives the new environment:

```sh
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build --force-recreate api
```

Important variables:

- `ADMIN_PASSWORD` — temporary shared admin password
- `DATABASE_URL` — API connection string; the Compose default points to the `db` service
- `SEED_LOCAL` — set to `true` to insert the seven sample projects on an empty database
- `PUBLIC_API_URL` — public API origin used in stored Markdown image URLs (for example `https://showcase.example.edu`)
- `VITE_API_URL` — frontend API origin compiled into the frontend image. Local Compose uses `http://localhost:8000`; leave it empty in production when Dokploy routes `/api` to the API service on the same domain, or set it to the public API origin when using a separate API domain.
- `UPLOADS_DIR` — backend image storage path; Compose sets this to `/app/uploads`
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` — PostgreSQL container settings

Seed data is inserted only when the database has no projects. To reset the local database and seed all seven projects, remove the Compose volume:

```sh
docker compose -f docker-compose.yml -f docker-compose.local.yml down -v
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

## API quick reference

### Public endpoints

```text
GET  /api/health
GET  /api/projects
GET  /api/projects/{detail_slug}
GET  /api/options
POST /api/projects
POST /api/uploads?draft_token={token}
GET  /api/uploads/{safe_filename}
```

A submission must include:

```json
{
  "title": "A useful automation project",
  "description_markdown": "## What it does\n\nA full Markdown description.",
  "contributors": ["Contributor Name"],
  "tools": ["Tool Name"],
  "department": "Academic Affairs",
  "submitter_email": "name@colby.edu"
}
```

Every new project is created with `pending` status and does not appear in the public project list until approved.

Example submission:

```sh
curl -X POST http://localhost:8000/api/projects \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "A useful automation project",
    "description_markdown": "## What it does\n\nA full Markdown description.",
    "contributors": ["Contributor Name"],
    "tools": ["Tool Name"],
    "department": "Academic Affairs",
    "submitter_email": "name@colby.edu"
  }'
```

### Admin endpoints

The current admin API uses a temporary password configured through `ADMIN_PASSWORD`. Log in and save the returned cookie before calling protected endpoints:

```sh
curl -c /tmp/automation-admin-cookie \
  -X POST 'http://localhost:8000/api/admin/login?password=local-admin'

curl -b /tmp/automation-admin-cookie \
  http://localhost:8000/api/admin/projects
```

Change a project's status:

```sh
curl -b /tmp/automation-admin-cookie \
  -X PATCH http://localhost:8000/api/admin/projects/2 \
  -H 'Content-Type: application/json' \
  -d '{"status":"approved"}'
```

Delete a project permanently:

```sh
curl -b /tmp/automation-admin-cookie \
  -X DELETE http://localhost:8000/api/admin/projects/2
```

Submission image uploads use a client-generated draft token and return a Markdown image reference. The frontend inserts that reference into the editable description before the project is submitted. Admins can add an image directly through the admin editor with `POST /api/admin/projects/{id}/images`.

Admin edits can update project fields as well as status. For example:

```sh
curl -b /tmp/automation-admin-cookie \
  -X PATCH http://localhost:8000/api/admin/projects/2 \
  -H 'Content-Type: application/json' \
  -d '{"title":"Updated project title", "department":"Library"}'
```

Sign out by clearing the admin cookie through:

```sh
curl -b /tmp/automation-admin-cookie \
  -X POST http://localhost:8000/api/admin/logout
```

## Compose files

- `docker-compose.yml` contains the API and PostgreSQL services without host port mappings. This keeps the base file suitable for deployment environments that provide their own routing.
- `docker-compose.local.yml` is a local-only override. It maps ports `8000` (API) and `5173` (frontend), enables seed data, supplies the local default admin password, and binds `./uploads` for easy local inspection.
- The base Compose file includes the persistent `uploads_data` volume for deployed images. It intentionally contains no host port mappings or Traefik configuration; Dokploy handles routing.

Always use both files for local development:

```sh
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

## Frontend development

The SvelteKit project is present and the MVP pages are implemented. The Compose setup exposes the frontend at `http://localhost:5173` and the backend API at `http://localhost:8000`. Existing npm commands include:

```sh
npm install
npm run dev
npm run check
npm run build
```

With the API and database running through Compose, run the browser workflow tests with:

```sh
npx playwright test
```

These cover the Explore, Submit, and Admin approval flows. The test runner starts a temporary frontend preview on port `4173`, so the API allows both the normal local frontend origin (`5173`) and the test origin (`4173`).

# Colby Tech Share

Where Colby staff and faculty share automations, tools, and tips. Someone writes up what they built
in a Google Doc, uploads the `.docx`, and the site parses it into a project page — text, headings,
lists, tables, links and images all come through. No user accounts: anyone on campus can browse and
submit; admins review what comes in and decide what gets published.

Further reading: [PRODUCT.md](PRODUCT.md) (what it is for), [DESIGN.md](DESIGN.md) (how it looks),
[AUDIT.md](AUDIT.md) (cross-browser design audit).

## Stack

| Piece      | What                                                                   | Port (local)          |
| ---------- | ---------------------------------------------------------------------- | --------------------- |
| `frontend` | SvelteKit (adapter-node) — server-rendered, the only client of the API | 5173 dev / 3000 built |
| `api`      | FastAPI + psycopg3 — `.docx` parsing, sanitization, data               | 8123 dev / 8000 built |
| `db`       | Postgres 17                                                            | 5432                  |

The browser never talks to FastAPI: SvelteKit server routes proxy everything. In production the API
and DB ports stay unpublished and Dokploy handles routing.

## Components

```
src/                SvelteKit app (repo root)
  env.ts            typed server env (API_URL, SESSION_SECRET, ADMIN_PASSWORD, PUBLIC_TEMPLATE_URL)
  hooks.server.ts   client address, per-IP rate limits, no-store on /admin
  csp.ts            the Content-Security-Policy
  routes/           Explore, /projects/[slug], /submit, /images/[uuid], /admin + dashboard,
                    /demo (scaffold leftovers), +error
  lib/              FastAPI client (api.ts), sanitizing markdown renderer (markdown.ts),
                    submit validation, admin session + guard, anti-bot token, rate limiting,
                    components/ (browser, filters, card, body, form, receipt, admin queue/editor)
api/                FastAPI, managed with uv
  app/              routers (projects, submissions, admin), .docx → Markdown (docx.py),
                    sanitizing HTML renderer (rendering.py), validation, uploads, SQL queries
  migrations/       numbered .sql files, applied in order at API startup
  seed.py           dev data: 3 published + 1 pending project (truncates first)
compose.local.yml   Postgres only — web and api run on your machine
compose.yml         production stack Dokploy runs: web + api + db, one published port
Dockerfile          web image (node:22-alpine, multi-stage)
api/Dockerfile      api image (uv on python:3.12-slim, non-root, healthcheck)
e2e/                Playwright: the publishing flow + security checks read off the wire
```

## Run it (local development)

```sh
cp .env.example .env                          # then edit — variables in the table below
docker compose -f compose.local.yml up -d db  # Postgres only
cd api && uv sync
npm run api:dev                               # terminal 1: API on 127.0.0.1:8123
cd api && uv run python -m app.seed
npm run dev                                   # terminal 2, repo root: web on :5173
```

`API_URL` in `.env` must name the port `npm run api:dev` is on (`http://localhost:8123`): 8000 is
the port other stacks on a shared machine tend to grab, and a wrong `API_URL` looks like a healthy
API answering 404 for everything. Migrations apply themselves at API startup; the seed script wipes
`projects` and `submitters` first — dev only.

Check the wiring:

```sh
curl -s localhost:8123/api/health           # {"status":"ok","database":"up",...}
curl -s localhost:8123/api/projects | head  # 3 published projects
```

## Run it (production)

`compose.yml` is what Dokploy runs: three services, `web` the only published port
(`${WEB_PORT:-3000}`), TLS and public routing handled by Dokploy. `api` waits for `db` to be healthy
and runs migrations at startup; named volumes `db-data` and `uploads` survive `compose down`.

Same variable names in `.env` locally and in Dokploy's environment UI in production:

| Variable                                              | Who       | Notes                                                                                              |
| ----------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | compose   | `POSTGRES_PASSWORD` has no default in production                                                   |
| `DATABASE_URL`                                        | api       | matches the three above; `localhost` on the host, `db` in compose                                  |
| `SESSION_SECRET`                                      | web + api | HMAC key for render tokens and the admin session; `openssl rand -hex 32`, no default in production |
| `ADMIN_PASSWORD`                                      | web       | the only admin credential; unset means `/admin` is closed                                          |
| `API_URL`                                             | web       | `http://localhost:8123` dev, `http://api:8000` in compose                                          |
| `PUBLIC_TEMPLATE_URL`                                 | web       | Google Docs template linked from Submit                                                            |
| `UPLOAD_DIR` / `MAX_UPLOAD_MB`                        | api       | where uploads land / size cap (default 10)                                                         |
| `WEB_PORT`                                            | compose   | the one published port, default 3000                                                               |
| `WEB_BODY_SIZE_LIMIT`                                 | compose   | adapter-node body cap, default `12M` — its 512K default is smaller than a `.docx`                  |

Smoke test off the server:

```sh
docker compose -p techshare-prod -f compose.yml up -d --build
# three healthy containers, CSP header on responses; `-p techshare-prod down -v` when done
```

## Tests

```sh
npm run check && npm run lint   # svelte-check + eslint/prettier
npm run test:unit               # vitest, DB-free
npm run test:e2e                # Playwright; needs the dev Postgres up, starts its own API + web,
                                # cleans up the rows it creates
cd api && uv run pytest         # API tests; submission ones skip without a database
```

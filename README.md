# Colby College Tech Share Forum

Where Colby staff and faculty share automations, tools, and tips. Someone writes up what they built
in a Google Doc, uploads the `.docx`, the site parses it into a project page. No user accounts —
anyone on campus can browse and submit; admins publish.

Status: **MVP complete (Phases 1–5)** — production `compose.yml` and both Dockerfiles, a
Content-Security-Policy, and the Playwright e2e suite are in. See [TODO.md](TODO.md) for the phase
notes and the v0.2.0 list.

## Stack

| Piece | What                                                                  | Port (local)          |
| ----- | --------------------------------------------------------------------- | --------------------- |
| `web` | SvelteKit (adapter-node) — server-rendered, calls the API server-side | 5173 dev / 3000 built |
| `api` | FastAPI + psycopg3 — owns `.docx` parsing, sanitization, data flow    | 8123 dev / 8000 built |
| `db`  | Postgres 17 (Docker)                                                  | 5432                  |

The browser never talks to FastAPI; SvelteKit server routes are the only client. In production the
API and DB ports stay unpublished and Dokploy handles routing.

## First run

```sh
cp .env.example .env          # then edit: see the table below
docker compose -f compose.local.yml up -d db      # Postgres only
cd api && uv sync
npm run api:dev               # api on 127.0.0.1:8123, --reload (API_PORT=8010 npm run api:dev to move it)
cd api && uv run python -m app.seed               # dev data: 3 published + 1 pending project
npm run dev                   # in a second terminal, from the repo root
```

`API_URL` in `.env` has to name the port `npm run api:dev` is on, so `http://localhost:8123` here —
that is the one variable in this project that can be quietly wrong, because `8000` is what almost
every other stack on the machine publishes itself (`npm run api:dev` avoids `8000` for that reason).
`npm run dev` reads `.env` at startup and prints what it found; restart it after a change.

Migrations run by themselves when the API starts (`api/migrations/*.sql`, tracked in
`schema_migrations`). The seed script truncates `projects` and `submitters` first — dev only.

Check it is wired up:

```sh
curl -s localhost:8123/api/health          # {"status":"ok","database":"up",...}
curl -s localhost:8123/api/projects | head  # 3 published projects, no bodies
open http://localhost:5173                 # whatever port `npm run dev` reported, if not this one

# 401 here (not 404) = the admin routes are live; the browser never sends that token, SvelteKit does
curl -s -o /dev/null -w '%{http_code}\n' 'localhost:8123/api/admin/projects?status=pending'
```

## Environment

`.env` lives at the repo root; Docker Compose reads it, and the API falls back to it when no real
environment variables are set. Do the same values in production, injected by Dokploy.

SvelteKit reads its own through `src/env.ts` (SvelteKit 3's typed env module, imported as
`$app/env/private`) — declare a variable there before using it server-side. `API_URL`,
`SESSION_SECRET`, `ADMIN_PASSWORD` and `PUBLIC_TEMPLATE_URL` are declared there. `API_URL` falls back
to `http://localhost:8000` and `SESSION_SECRET` to a per-process key, so a missing value costs one
feature rather than blocking `npm run dev`. An unset `ADMIN_PASSWORD` is not a crash either: the site
works and `/admin` says sign-in is not turned on.

| Variable              | Who            | Notes                                                                                     |
| --------------------- | -------------- | ----------------------------------------------------------------------------------------- |
| `POSTGRES_USER`       | compose        | superuser created in the volume                                                           |
| `POSTGRES_PASSWORD`   | compose        |                                                                                           |
| `POSTGRES_DB`         | compose        |                                                                                           |
| `DATABASE_URL`        | api            | must match the three above; `localhost` on the host, `db` in compose                      |
| `SESSION_SECRET`      | web + api      | HMAC key for the anti-bot render token **and** the admin session — `openssl rand -hex 32` |
| `ADMIN_PASSWORD`      | web            | the only admin credential; unset means `/admin` is closed                                 |
| `API_URL`             | web            | where SvelteKit reaches FastAPI (`http://localhost:8123` dev, `http://api:8000` compose)  |
| `PUBLIC_TEMPLATE_URL` | web            | Google Docs template linked from Submit                                                   |
| `UPLOAD_DIR`          | api            | source `.docx` files, `/data/uploads` in compose                                          |
| `MAX_UPLOAD_MB`       | api            | submission size cap, default 10 — the API is the one that actually refuses a file         |
| `WEB_PORT`            | compose (prod) | the only published port, default 3000; Dokploy maps its public port to this               |
| `WEB_BODY_SIZE_LIMIT` | compose (prod) | adapter-node body cap, default `12M` — its own default of 512K is smaller than a `.docx`  |

There is no `ORIGIN` variable: this adapter-node derives the origin from the proxy headers instead,
and an `ORIGIN=` line in an environment file is read by nobody. The three header names themselves
(`PROTOCOL_HEADER` / `HOST_HEADER` / `ADDRESS_HEADER`) are read from the environment too, but
`compose.yml` sets them — they are the forwarded-header contract below, not `.env` material.

On a machine running several of these projects, `8000` and `5173` are the ports that collide: another
stack publishing `0.0.0.0:8000` means `API_URL=http://localhost:8000` talks to _that_ API and nothing
says so. `npm run dev` prints one line about it at startup, and every message below names the base URL
it tried. To use a stack on another port, pass it to `API_PORT=` / `npm run dev -- --port` and point
`API_URL` at it. Production never sees this, because `API_URL=http://api:8000` is a container-network
name.

Three ways the wiring goes wrong, and none of them used to be loud:

- **Submit answers `The submission was rejected (404)` and the queue answers `Error 503`.** A 404 out
  of `/api/submissions` or `/api/admin/*` is never a missing page and never a rejected write-up:
  either the route exists, or whatever answered is not this API. Every one of those messages now names
  the path and the base URL it tried, because the usual cause is `API_URL` unset (the `src/env.ts`
  fallback is `http://localhost:8000`, a busy port on a shared machine) or aimed at another service.
- **Explore renders zero projects.** A 404 from `GET /api/projects` is a fault, not an empty shelf, so
  it is now the API-problem notice rather than "nothing is published yet". Only a 404 for one slug is
  a real 404.
- **The API answers with routes the code no longer has.** A `uvicorn` started before those routes
  existed serves no `/api/submissions` and no `/api/admin/*` at all and answers 404 for both, which is
  what the queue prints as `Error 503` while `/api/health` looks perfectly healthy. It has happened
  twice: once to a wrong `API_URL`, and once to a hand-started `uvicorn` with no `--reload` that was
  left running for days and never saw `routers/admin.py`. **Start the API with `npm run api:dev`,
  never a bare `uv run uvicorn`**: only the npm script passes `--reload`, and without it the process
  goes stale the moment a router changes. Ask a live process what it actually serves:

  ```sh
  curl -s localhost:8123/openapi.json | python3 -c "import json,sys; print(sorted(json.load(sys.stdin)['paths']))"
  ```

  A current one lists eight paths, four of them under `/api/admin` (six operations once you count
  methods). `src/lib/api.ts` runs this same check at startup (`missingApiRoutes`), which is why the
  error could name a stale process instead of just saying _Not Found_.

## Production: compose.yml and Dokploy

`compose.yml` is the file Dokploy runs: three services, one published port, and no routing config —
Dokploy's proxy terminates TLS and forwards to `web`. `api` and `db` have no `ports:` at all, so the
only way into the API is through the web server, which is what makes "the browser never talks to
FastAPI" true at the network level rather than by convention.

- **Ordering.** Migrations run at API startup, so `api` waits for `db` to be _healthy_
  (`pg_isready` healthcheck in compose). `web` waits only for `api` to have _started_, because
  Explore is designed to show a "service not responding" notice rather than refuse to boot. The API
  image carries its own healthcheck, which answers 503 while the database is unreachable.
- **Volumes.** `db-data` (Postgres) and `uploads` (the source `.docx` files) — both named, both
  surviving `compose down` without `-v`.
- **Variables.** Same names as the table above, injected by Dokploy's environment UI.
  `POSTGRES_PASSWORD` and `SESSION_SECRET` have no default on purpose — compose refuses to start
  without them, because an empty password on a machine plugged into the campus network is not a
  failure mode worth discovering later. `ADMIN_PASSWORD` unset means the stack still runs and
  `/admin` says sign-in is not turned on.
- **One published port.** `web` takes `${WEB_PORT:-3000}:3000`; Dokploy maps its own public port to
  that one.

### The forwarded-header contract

adapter-node sits behind Dokploy's proxy and cannot see that on its own; it guesses, and the guesses
are silent. `compose.yml` sets three headers, and this is the contract to keep if the proxy setup
ever changes:

- `PROTOCOL_HEADER: x-forwarded-proto` — with nothing to read, adapter-node assumes the request came
  in over `https`. Kit compares the browser's `Origin` with what the app believes its own origin to
  be, and on a mismatch answers **every form POST with 403 "Cross-site POST form submissions are
  forbidden"** — `/submit` and `/admin` both dead while every page still renders.
- `HOST_HEADER: x-forwarded-host` — the public name, not the service name the proxy may have
  rewritten `Host` to.
- `ADDRESS_HEADER: x-forwarded-for` — otherwise `event.getClientAddress()` is the proxy's address,
  and the per-client submission limit becomes one limit shared by the entire campus. The flip side:
  with it set, a request arriving without the header throws, so `hooks.server.ts` files such clients
  under a shared `UNKNOWN_CLIENT` bucket rather than 500-ing the page.

The e2e suite fakes the same three (`playwright.config.ts`), so a local run and the production run
agree about what a request looks like.

`WEB_BODY_SIZE_LIMIT` is 12M because adapter-node caps a request body at 512 KB by default — smaller
than a photo-heavy `.docx`. The API refuses anything over `MAX_UPLOAD_MB` anyway; the web cap is the
same window plus the multipart envelope, so the API's sentence — not a raw 413 — is what a submitter
with an oversized file reads.

### Smoke-testing it off the server

`compose.local.yml` and `compose.yml` both call their database service `db`, so run the production
file under its own project name:

```sh
docker compose -p techshare-prod -f compose.yml up -d --build   # add WEB_PORT=3999 to move the port
docker compose -p techshare-prod down -v                        # when done; -v drops the volumes
```

Three healthy containers, `web` reaching `api` by service name, and the CSP header present on the
built pages is the whole manual check — the Playwright suite covers the behaviour.

## Layout

```
src/          SvelteKit (repo root, no web/ folder)
  env.ts        typed server env (API_URL, SESSION_SECRET, ADMIN_PASSWORD, PUBLIC_TEMPLATE_URL)
  csp.ts        the Content-Security-Policy, handed to vite.config.ts (build config, not a header hook)
  hooks.server.ts  client address + per-IP limits (submissions, admin sign-in) + `no-store` on /admin
  routes/       Explore, /projects/[slug], /submit, /admin
    +page.server.ts / +page.svelte      Explore: one load, filters in the browser
    projects/[slug]/                    project page (404 for pending/rejected slugs)
    submit/                             +page.server.ts (action) + +page.svelte (form | receipt)
    admin/                              sign-in (not linked from anywhere, blocked in robots.txt)
    admin/dashboard/                    the queue: pending | published | rejected | all
    admin/dashboard/[id]/               one write-up: save, preview, slug, status, delete
    demo/                               scaffold leftovers + their one e2e test (pending a decision to remove)
    +error.svelte                       friendly 404/5xx shell
  lib/
    api.ts        server-side FastAPI client (timeouts, ApiError, multipart submissions,
                  /api/admin with the bearer token)
    types.ts      mirrors api/app/models.py
    filters.ts    the client-side Explore filtering
    markdown.ts   re-checks API HTML before `{@html}` (fail closed -> Markdown source)
    format.ts     dates / bylines
    validation.ts the Submit rules, mirrored from api/app/validate.py
    antibot.ts    signed render token (min render→submit delay) + client IP from proxy headers
    rate-limit.ts fixed-window limiter, per client IP, in process memory
    admin-session.ts  the signed admin cookie: format, expiry, the password comparison
    admin-guard.ts    who gets past /admin (load *and* actions call it)
    admin-queue.ts    the queue's ?status= and ?notice= meaning
    components/   ProjectBrowser, ProjectFilters, ProjectCard, ProjectBody,
                  SubmissionForm, SubmissionReceipt, AdminQueue, AdminProjectEditor
  tests/fixtures.ts   sample projects/submission used by the component tests
  app.css       placeholder global styles (real design comes later)
api/          FastAPI, managed with uv
  app/          main, config, db (psycopg pool), migrations, models, rendering, slugs
    auth.py     verifies the cookie SvelteKit signed (it never issues one and never sees a password)
    docx.py     .docx → HTML (mammoth + style_map) → Markdown (markdownify), images dropped
    validate.py the submission metadata rules + the @colby.edu pattern/soft-warning pair
    uploads.py  extension, size cap, zip sniff, key inside the uploads volume
    queries/    hand-written SQL, one module per entity
    routers/    HTTP layer: projects, submissions, admin
  migrations/   numbered .sql files, applied in filename order at startup
  tests/        pytest — sanitizer, .docx fixture, validation, admin; submissions and admin run
                against a real Postgres and skip themselves when DATABASE_URL does not answer
  seed.py       uv run python -m app.seed
compose.local.yml  Postgres only — web and api run on your machine
compose.yml        production: web + api + db, one published port, no routing config (Dokploy)
Dockerfile         web image (multi-stage node:22-alpine; the runtime stage ships `build/` alone)
api/Dockerfile     api image (uv on python:3.12-slim, non-root, its own healthcheck)
playwright.config.ts  e2e: starts the API on :8124 and a fresh `node build` of web on :4173
e2e/               publishing.e2e.ts (submit → review → Explore → cleanup),
                   security.e2e.ts (CSP header + cookie flags read off the wire)
```

## Tests

```sh
npm run check && npm run lint    # svelte-check + eslint/prettier
npm run test                     # unit (vitest) then e2e (Playwright)
npm run test:unit                # vitest only — browser (Chromium) + node projects
npm run test:e2e                 # Playwright only
cd api && uv run pytest          # API tests; the submission ones skip without a database
cd api && uv run python -m compileall -q app   # quick API syntax check
```

The unit suites are DB-free (234 web tests in 23 files, 95 API tests). The e2e suite is not, and it
is the only test that knows whether the halves still fit together:

- **Needs the dev Postgres first**: `docker compose -f compose.local.yml up -d db`.
- **It starts its own servers** — the API on `:8124`, and a fresh production build (`node build`,
  the same process `compose.yml` runs, so `BODY_SIZE_LIMIT` and adapter-node's origin handling are
  under test rather than skipped) on `:4173`. Those ports were chosen to not collide with anything
  else on a shared machine; `E2E_API_PORT` / `E2E_WEB_PORT` override. The config fakes the proxy
  headers Dokploy would send and hands both processes a throwaway `SESSION_SECRET` /
  `ADMIN_PASSWORD`, so the repo's real `.env` is never read into a test.
- **It leaves the database as it found it**: `e2e/publishing.e2e.ts` files a `.docx`, publishes it,
  reads it back, then deletes it and asserts the slug 404s afterwards. It asserts on its own row,
  never on counts, so seed rows cannot break a run. A run killed halfway leaves one pending row in
  the local queue — delete it from `/admin/dashboard/<id>`, the same cleanup a reviewer would do.
- **`e2e/security.e2e.ts`** reads the hardening off the wire rather than off the source: the CSP
  header, the admin cookie flags, and that hostile markup pasted through the admin editor still does
  not run — three layers (markdown-it, bleach, CSP) with a hole in any one of them still ending in
  nothing executing.
- **One worker**, because the tests are one project's life in order. The HTML report lands in
  `playwright-report/`.

## How a submission becomes a pending project

`browser → POST /submit (SvelteKit action) → POST /api/submissions (FastAPI) → Postgres`

1. `src/hooks.server.ts` resolves the client address from what the proxy sent (`X-Real-IP`, else the
   right-most `X-Forwarded-For` hop) and caps submissions at 12 per 15 minutes per client, bouncing
   with `303 → /submit?limited=<seconds>` so the answer is readable with JavaScript off.
2. The action rejects the honeypot (`name="company"`) and the render token — an HMAC of the render
   time, so a form posted without ever being rendered, or submitted in well under three seconds,
   gets a sentence rather than a project. Both sides answer a honeypot with the same uninformative
   message.
3. `src/lib/validation.ts` runs the metadata rules in the browser, then again in the action, and
   `api/app/validate.py` runs them a third time — the API is the one that decides, because it is the
   only one holding the document. `@colby.edu` is required; an odd local part (`jchen24@`) submits
   with a warning. `validation.spec.ts` and `api/tests/test_validate.py` keep the two ends honest.
4. FastAPI stores the file in the uploads volume, converts it with
   `mammoth → markdownify` (Heading 1–3 → `#`–`###`, images dropped because mammoth inlines them as
   base64), then inserts the project as `pending` and upserts the submitter **in one transaction** —
   a rollback leaves no orphaned person and no half-written project. Slug:
   `<title-slug>-<YYYY-MM-DD>-<short-id>`.
5. The receipt names the project id and the fact that it is not published yet. A `pending` slug is a
   404 and its title appears nowhere public, so the receipt deliberately links to neither.

Error messages reach the submitter as sentences: `api/app/main.py` installs a handler that turns
FastAPI's validation structures into one human line, because the form prints `detail` as written.

## How a write-up gets published

`browser → /admin (SvelteKit) → /api/admin (FastAPI) → Postgres` — the browser is handed HTML, never a
token, and never talks to FastAPI.

1. `src/routes/admin/+page.server.ts` compares the typed password with `ADMIN_PASSWORD` in constant
   time and, if it matches, sets a signed cookie. That is the only place the password exists in a
   request. `hooks.server.ts` has already counted the attempt: ten per 15 minutes per address, the
   eleventh bounced before the body is read.
2. The cookie is `base64url({sub,iat,exp}).base64url(HMAC-SHA256)`, keyed on `SESSION_SECRET`, valid
   eight hours, `HttpOnly`, `SameSite=Strict`, `Secure` outside dev, `path=/admin` and no `Max-Age`
   (a refresh keeps you signed in, closing the browser does not). `api/app/auth.py` verifies the same
   signature; it has no login endpoint and never sees the password. Both sides check the same golden
   token, in `admin-session.spec.ts` and `api/tests/test_auth.py`, so a format change on one side
   fails the other suite.
3. Every admin page and every admin form action calls `requireAdminToken(cookies)`. Actions matter:
   a form action does not run the layout's guard, so a `curl POST` to `?/delete` reaches the action
   itself and is stopped there.
4. `/api/admin` is the only API surface that returns submitter email addresses, so it is the only one
   behind that bearer token. `/admin` responses all carry `Cache-Control: no-store` and `robots.txt`
   blocks the path.
5. Status changes, edits and deletes are four separate form actions (`?/status`, `?/save`, `?/slug`,
   `?/delete`) hitting four separate endpoints. Saving never sends `slug` and never sends `status`, so
   neither can move as a side effect of fixing a typo. Deleting needs the confirmation box ticked and
   takes the stored `.docx` with it.

## How a project body reaches the page

`.docx`/Markdown is stored as Markdown, and FastAPI turns it into HTML on read
(`api/app/rendering.py`: markdown-it with raw HTML off, then bleach — only an allow-list of tags
survives, and every link gets `target="_blank" rel="noopener noreferrer nofollow"`).
`src/lib/markdown.ts` re-checks that fragment at the point of injection: if it finds a live tag,
an event handler or a `javascript:`/`data:` URL it refuses the whole thing and the page shows the
Markdown source instead. It verifies rather than rewrites, so the failure mode is ugly-but-safe.
Keep the two allow-lists in step if you change either.

Behind both sanitizers sits a third layer that never reads the markup at all: the
Content-Security-Policy from `src/csp.ts`, applied at build time (`vite.config.ts` → Kit's `csp`
option, which nonces the inline scripts Kit itself emits). `script-src 'self'` with no
`unsafe-inline` means a script that arrives inside a write-up has no nonce and does not run —
independently of whether either sanitizer above it ever grows a hole. The only loosenings are
`style-src 'unsafe-inline'` (Svelte inlines component CSS; styles cannot execute), `img-src data:`
(Vite inlines the favicon) and `ws:` for the dev hot-reload socket. `src/csp.spec.ts` pins the
directives; `e2e/security.e2e.ts` reads the header off the running server.

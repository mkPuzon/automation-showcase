# Colby College Tech Share Forum

A platform where Colby staff and faculty share automations, tools, assignments, and tips for saving
time and improving work using modern technology. Users submit a written-up `.docx`; the site parses
it and renders it as a project page.

There are no user accounts. Anyone on the campus network can browse and submit. Safeguards are
anti-bot only. Only admins can edit or delete projects after submission.

Status: **Phase 4 done and committed** (`828fe9e`) — admin review: sign-in, queue, editor,
publish/reject, delete, slug control. 198 web + 95 API tests green, `npm run check` and `lint` clean.
Next up: Phase 5, hardening, docs and the production compose files.

---

## Locked decisions

1. **Python = the FastAPI backend.** It owns all endpoints, `.docx` parsing, sanitization, and data
   flow. SvelteKit is the frontend only and calls FastAPI server-side (browser never hits FastAPI
   directly → no CORS, one exposed port). Raw JS/TS end-to-end was considered and rejected: Python's
   `.docx` and sanitization tooling is materially better, and the stack spec calls for Python.
2. **`projects.name` is the numeric id** (surrogate PK); **`projects.title` is a separate string**.
3. **`submitters` is a real table**, upserted inside the same transaction as the project insert.
   `departments` is a `text[]` accumulated across that person's submissions; their projects are
   reachable via `projects.submitter_id`.
4. **Slug:** `<title-slug>-<YYYY-MM-DD>-<short-id>`, generated server-side at submission, stored in a
   unique `slug` column. **Editing the title does NOT change the slug** — the admin edit page has a
   separate, explicit "update slug" field for a manual change.
5. **Plain SQL migrations**, no ORM. Numbered `.sql` files in `api/migrations/`, applied in filename
   order at API startup and recorded in a `schema_migrations` table. Queries written by hand with
   `psycopg` (v3).
6. **SvelteKit owns the admin session; FastAPI only verifies it** (adapter-node gives us real
   cookies). The login form action in `src/routes/admin/+page.server.ts` compares `ADMIN_PASSWORD`
   in constant time and sets an **HttpOnly, `SameSite=Strict`, `Secure`-in-prod session cookie scoped
   to `path: '/admin'` with no `Max-Age`** — so it survives a page refresh (usability) and dies when
   the browser closes. Cookie value = HMAC-signed payload keyed on `SESSION_SECRET`, 8h expiry;
   SvelteKit server code forwards it to FastAPI as `Authorization: Bearer <token>` and FastAPI checks
   the same signature. Browser JS never sees the token, so `/admin` stays server-rendered and needs
   no client-only dashboard. Logout clears the cookie; `/admin` responses send `no-store`.
7. **Anti-bot (no third-party CAPTCHA):** honeypot field, minimum render→submit time, per-IP rate
   limit in API process memory, and `@colby.edu` validation. `robots.txt` blocks `/admin`.
8. **Email rule:** hard requirement is the `@colby.edu` domain. `letters@colby.edu` and
   `first.last@colby.edu` both pass. Non-`colby.edu` is rejected outright; a `@colby.edu` address
   whose local part looks non-standard (digits, hyphens) shows a soft warning but still submits.
9. **Styling:** hand-written global CSS, no framework, no brand rules. Real styling is deferred to
   specialized agents later — do not spend effort on aesthetics now.
10. **Filtering is client-side:** load all published projects (metadata only, no bodies) once, then
    filter/search in the browser by technology, title, department, author.
11. **Google Docs template link** lives on the Submit page as a single constant/env var
    (`PUBLIC_TEMPLATE_URL`) so it is easy to swap.
12. **Compose:** `compose.local.yml` = Postgres only (app + API run on the host). `compose.yml` =
    `web` + `api` + `db`, no Traefik (Dokploy handles routing), `db` and `api` unpublished.
    `web` uses `@sveltejs/adapter-node` (replacing `adapter-auto`) on port 3000.
13. **Seed: 4 projects — three `published`, one `pending`.**
14. **One status vocabulary: `pending` / `published` / `rejected`** — the same words in the DB check
    constraint, API, code, tests, and UI (UI labels: "Pending review", "Published", "Rejected").
    **"Approved" is retired** as a status name everywhere, including "approve" as a verb for the
    publish action.
15. **Tests (component-level, deliberately limited):** submission form validation, admin login,
    Markdown sanitize/XSS. One Playwright e2e: submit → pending → admin publishes → visible on
    Explore. Unit tests stay DB-free.
16. v0.2.0 scope: **not planned yet.**

---

## Architecture

```
browser ──▶ SvelteKit (web, adapter-node :3000)
              │  server routes / form actions only
              ▼
            FastAPI (api :8000, internal only)
              │  psycopg3, plain SQL
              ▼
            Postgres (db :5432, internal only)   +   uploads volume /data/uploads (source .docx)
```

```
techshare/                  SvelteKit stays at the repo root (no web/ restructure)
  src/
    hooks.server.ts           login throttling + submission rate limiting per client IP
    routes/
      +page.svelte            Explore (client-side filtering)
      projects/[slug]/+page.svelte
      submit/                 +page.svelte, +page.server.js (form actions)
      admin/                  +page.svelte (login) + +page.server.ts (login/logout actions),
                              admin/dashboard/  — server-rendered, guarded by the session cookie
    lib/                      thin FastAPI client, admin session, markdown render, components
      admin-session.ts        sign/verify the session token (SESSION_SECRET, 8h expiry)
      api.ts                  thin FastAPI client used server-side
      markdown.ts             verifies API-rendered HTML before {@html}
      components/             ProjectCard, ProjectFilters, SubmissionForm, AdminProjectEditor, ...
  api/
    app/main.py               FastAPI app + startup: run migrations
    app/db.py                 psycopg pool + query helpers
    app/docx.py               .docx → Markdown (mammoth), bleach sanitize
    app/auth.py               verify the HMAC session token + expiry (no login route here)
    app/routers/{projects,submissions,admin}.py
    migrations/00x_*.sql
    pyproject.toml            (uv)  Dockerfile
  compose.yml               production-style: web + api + db
  compose.local.yml         local: postgres only
```

**Auth flow:** browser → SvelteKit form action checks `ADMIN_PASSWORD` → sets the `/admin`-scoped
HttpOnly cookie → every admin `load`/action reads that cookie and calls FastAPI with it as a bearer
token. FastAPI holds no session state and never talks to the browser.

**Docx flow:** `POST /api/submissions` (multipart) → validate metadata → save the file to the
uploads volume → parse to Markdown → sanitize → insert project (`status='pending'`) + upsert
submitter, one transaction → respond with the project id and pending status.

**Parsing pipeline** (`api/app/docx.py`):
`mammoth.convert_to_html(file, style_map=...)` → `markdownify` → **store Markdown** → on read,
`markdown-it-py` with raw HTML disabled → `bleach` sanitize → send HTML to the frontend.

> ⚠️ Do **not** use `mammoth.convert_to_markdown` — python-mammoth documents its Markdown output as
> **deprecated**. Route through mammoth's HTML output and convert with `markdownify`.

**Bodies are stored as sanitized Markdown** (`body_markdown`) and rendered to HTML on read. This
keeps admin editing a plain textarea over something human-readable, and matches the
"sanitized Markdown rendering" requirement.

**Python deps:** `fastapi`, `uvicorn`, `psycopg[binary]`, `python-multipart`, `mammoth`,
`markdownify`, `markdown-it-py`, `bleach`, `pydantic-settings` (managed with `uv`).

### Data model

```sql
submitters(
  id            bigserial pk,
  email         text unique not null,      -- lowercased
  first_name    text not null,
  last_name     text not null,
  departments   text[] not null default '{}',
  created_at / updated_at
)

projects(
  id              bigserial pk,            -- the "name" (numeric id)
  slug            text unique not null,
  title           text not null,
  body_markdown   text not null default '',
  technologies    text[] not null default '{}',
  contributors    text[] not null default '{}',   -- optional
  department      text not null,
  submitter_id    bigint not null references submitters(id) on delete cascade,
  status          text not null default 'pending'
                    check (status in ('pending','published','rejected')),
  source_filename text,                    -- original .docx name
  source_path     text,                    -- key inside the uploads volume
  created_at / updated_at
)
```

Status vocabulary is the single set `pending` / `published` / `rejected`, used identically in the
database, API, code, and UI. Explore exposes `published` projects only.

### API surface

Public
- `GET /api/projects` — published only, metadata only (no `body_markdown`) for client-side filtering
- `GET /api/projects/{slug}` — full project + rendered sanitized HTML
- `POST /api/submissions` — multipart metadata + `.docx`

Admin — every route requires `Authorization: Bearer <session token>`, which only SvelteKit server
code sends (the API port is unpublished, so no browser can reach it). Login/logout are SvelteKit
form actions, not API endpoints.
- `GET /api/admin/projects?status=pending|published|rejected|all`
- `PATCH /api/admin/projects/{id}` — title, technologies, contributors, department, `body_markdown`,
  optional explicit `slug` change
- `POST /api/admin/projects/{id}/status` — pending/published/rejected
- `DELETE /api/admin/projects/{id}`

### Environment

`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` / `DATABASE_URL`, `ADMIN_PASSWORD` (web
container only), `SESSION_SECRET` (web + api sign/verify the session token with it; e.g. `openssl
rand -hex 32`), `PUBLIC_TEMPLATE_URL` (Google Doc template), `UPLOAD_DIR` (default `/data/uploads`),
`API_URL` (as seen by the web container), `ORIGIN`.

---

## MVP — working skeleton, all services running and connected with dummy data

### Phase 1 — infra, database, seed data

- [x] `compose.local.yml` with Postgres only; confirm `npm run dev` + `uvicorn` on the host against it
- [x] `api/` FastAPI scaffold with `uv` (`pyproject.toml`, `app/main.py`, healthcheck route)
- [x] startup migration runner (`schema_migrations`) + `migrations/001_init.sql` (`submitters`, `projects`)
- [x] psycopg connection pool + typed query modules, no ORM
- [x] `GET /api/projects`, `GET /api/projects/{slug}` returning published projects only
- [x] seed script: **4 projects (3 published, 1 pending)**, 2–3 submitters, realistic Colby-flavored
      content; one submitter with multiple departments to exercise the derived array
- [x] switch SvelteKit to `@sveltejs/adapter-node`; `.env.example` filled in (`ORIGIN`,
      `SESSION_SECRET`, `ADMIN_PASSWORD`, `API_URL`) — **done except the env files themselves**: the
      agent tooling refuses to read or write `.env*` paths, so `README.md` holds the full variable
      list and the user keeps `.env` / `.env.example` in sync by hand
- [x] minimal nav (Explore / Submit) and placeholder global CSS

> **Phase 1 notes.** API: `uv run uvicorn app.main:app --port <p>` from `api/`, health at
> `/api/health`, seed with `uv run python -m app.seed`. The root `.env` still carried a
> `postgresql+psycopg://…@db:5432/automation` `DATABASE_URL` from another project (psycopg rejects
> the `+psycopg` scheme and `db` does not resolve on the host) — it must be repointed at
> `localhost` + the techshare credentials. Bodies are already stored as Markdown and rendered to
> sanitized HTML by `app/rendering.py`, so Phase 2 only adds the frontend side.

### Phase 2 — Explore + project detail
- [x] `src/lib/api.ts` server-side client; Explore loads via a `+page.server.js` load function
- [x] Explore grid of project cards (title, department, technologies, author, date)
- [x] client-side filters: technology, title text, department, author (`+page.svelte`, no URL params)
- [x] `/projects/[slug]` detail page: metadata header + rendered sanitized body
- [x] Markdown → HTML renderer with sanitization (links open safely, no raw HTML/script injection)
- [x] component tests: card rendering, filter behaviour, sanitizer XSS case

> **Phase 2 notes.**
> - Files that landed: `src/lib/{api,types,filters,markdown,format}.ts`,
>   `src/lib/components/{ProjectBrowser,ProjectFilters,ProjectCard,ProjectBody}.svelte`,
>   `src/routes/+page.server.ts`, `src/routes/projects/[slug]/*`, `src/routes/+error.svelte`,
>   `src/tests/fixtures.ts`. The plan called the guard `markdown.svelte.ts`; it exports no runes, so
>   it is plain **`markdown.ts`**.
> - **Sanitization stays in FastAPI.** `app/rendering.py` now stamps every link with
>   `target="_blank" rel="noopener noreferrer nofollow"` (markdown-it `link_open` rule — bleach 6.4
>   treats its attribute callable as a yes/no gate, so it cannot add attributes itself).
>   `src/lib/markdown.ts` is a *verifier*, not a second sanitizer: any live tag, event handler,
>   unsafe URL, unknown attribute or unquoted-tag oddity makes it refuse the fragment and
>   `ProjectBody` falls back to the raw Markdown in a `<pre>`. Belt-and-braces, fail closed.
> - `ProjectBrowser.svelte` owns filter state and the grid so both are testable without booting
>   SvelteKit routing; `+page.svelte` just passes `data.projects` in. Filtering lives in
>   `src/lib/filters.ts` (pure) and never touches the URL.
> - Explore renders even when the API is down (`data.problem` + a `role="alert"` notice); the detail
>   page returns 503. A pending/rejected slug reads as **404** — `queries/projects.py` only ever
>   exposes published rows.
> - **SvelteKit 3 specifics** (learned the hard way, applies to Phases 3–4): the env module is
>   `src/env.ts` + `defineEnvVars` + `$app/env/private` (`$env/dynamic/private` no longer type-resolves),
>   `+page.server.ts` types are `PageServerLoad` (there is no `Loader`), the `#lib/*` subpath imports
>   needed matching `compilerOptions.paths` in `tsconfig.json` for svelte-check, and vitest-browser
>   uses `locator.selectOptions(...)`, not Playwright's `selectOption`.
> - API-side: added `pytest` as a dev group and `api/tests/test_rendering.py` (5 tests, DB-free).
>   Seed data now contains a Markdown link so the safe-link path is visible locally.
> - Still open, for the user to decide: the scaffold's `/demo` routes and `src/lib/vitest-examples/`
>   are untouched and still reachable in dev.

### Phase 3 — Submission flow with `.docx` parsing
- [x] `/submit` form: first/last name, Colby email, department, title, technologies, contributors
      (optional), `.docx` file, template link, honeypot field
- [x] client + server validation; `@colby.edu` hard check with soft warning on odd local parts
- [x] `POST /api/submissions`: save file → `mammoth` HTML → `markdownify` Markdown → `bleach`
      sanitize → insert project (`pending`) + upsert submitter in one transaction
- [x] strip `<img>` in the MVP pipeline (mammoth emits base64 data URIs); `style_map` mapping Word
      Heading 1/2/3 → `#`/`##`/`###`
- [x] slug generation: `<title-slug>-<YYYY-MM-DD>-<short-id>`, collision-safe
- [x] rate limiting per client IP + minimum render→submit time, enforced in `src/hooks.server.ts`
      using Dokploy's `X-Forwarded-For` (the API never sees the real browser IP)
- [x] pending confirmation screen with a "your submission is awaiting review" state
- [x] reject non-`.docx` uploads, empty/unreadable documents, and oversized files (size cap)
- [x] tests: form validation, docx→Markdown conversion on a checked-in `.docx` fixture, transaction
      rollback on bad input

> **Phase 3 notes.**
>
> - **API side** (all pre-existing code kept, plus the fixes below): `api/app/docx.py` (mammoth HTML →
>   markdownify, images dropped, `style_map` for Heading 1–3), `api/app/validate.py` (metadata rules +
>   the email pattern/warning pair), `api/app/uploads.py` (extension, size cap, `.zip` sniff, key
>   inside the volume), `api/app/routers/submissions.py` + `api/app/queries/submissions.py` (the one
>   transaction). Two fixes landed here: submission metadata fields are `str | None` so an *empty* form
>   value is answered by `validate.py` in a sentence instead of by pydantic in a structure, and
>   `app/main.py` now installs a `RequestValidationError` handler so `detail` is **always one
>   human-readable sentence** — the form prints `detail` straight to the submitter.
> - **Web side, new:** `src/lib/validation.ts` (the same rules, for the browser),
>   `src/lib/antibot.ts` (signed render token + the proxy-aware client address),
>   `src/lib/rate-limit.ts` (fixed window, in process),
>   `src/lib/components/{SubmissionForm,SubmissionReceipt}.svelte`,
>   `src/routes/submit/+page.server.ts`, and `src/hooks.server.ts` (was empty). `src/env.ts` gained
>   `API_URL`, `SESSION_SECRET`, `PUBLIC_TEMPLATE_URL`; `App.Locals.clientIp` was added.
> - **Three copies of the rules, on purpose**: the browser (courtesy, so mistakes cost nothing), the
>   action (the answer a no-JS submitter gets), and FastAPI (the one that decides, because it is the
>   only one that can see the document). `validation.spec.ts` and `api/tests/test_validate.py` hold
>   the two ends of that rope: change one and the other complains.
> - **Rate limiting lives in `hooks.server.ts`, not the action** — it is the only place that runs
>   before SvelteKit reads a 10 MB body, and Phase 4's login throttling will sit beside it. It bounces
>   with `303 → /submit?limited=<seconds>` rather than a bare 429, because a form POST answered with a
>   status line is unreadable without JavaScript; `/submit` reads `limited` and says what to do.
>   12 submissions / 15 min per client. Generous on purpose: campus traffic leaves through a few egress
>   IPs, and a tight limit would throttle a building.
> - **Render token**: `<epoch-ms>.<base64url hmac>`, keyed on `SESSION_SECRET` (empty → a per-process
>   key, fine locally). Minimum age 3s, maximum 1h. Re-issued on every render, so sitting out a rate
>   limit does not expire the form. The honeypot is `name="company"` on both sides (`HONEYPOT_FIELD`)
>   and a filled one is answered with the same sentence as the API's, which tells a bot nothing.
> - **`novalidate` on the form**, deliberately: the browser's native tooltips would speak different
>   words than the three validators above, and would fire *before* `use:enhance` sees the submit at
>   all. The `required` attributes stay for assistive technology. Text inputs are `bind:value` to
>   local state seeded from the action's echo — the uploaded file, honeypot and token are read from
>   `FormData`.
> - The receipt does **not** link the new slug. Confirmed against a real Postgres: a pending slug reads
>   404, and the pending title appears nowhere on Explore or the landing page.
> - **Verified end to end by hand** (browser → action → FastAPI → Postgres): submitter upserted with
>   `departments{text}`, project inserted `pending` with slug
>   `smoke-test-write-up-ec7xn-for-the-submission-flow-2026-10-04-8f50`, `body_markdown` 943 chars from
>   `project-template.docx`, `source_filename` stored. Those rows were deleted afterwards; the dev
>   database is back to 3 published / 1 pending.
>   **Careful reproducing that**: typing into the form before hydration finishes gets wiped by
>   hydration, which reads as "the form lost my first name". Wait for hydration in any automation.
> - Tests: **89 web** (`validation` 20, `antibot` 15, `rate-limit` 8, `SubmissionForm` 9,
>   `SubmissionReceipt` 4 …) and **48 API**. `npm run check`, `npm run lint` clean.
> - `.env` / `.env.example` remain user-maintained (the tooling refuses `.env*` paths). New variables
>   the submit flow reads: `SESSION_SECRET`, `PUBLIC_TEMPLATE_URL`, and `API_URL` as the *web server*
>   sees it. `MAX_UPLOAD_MB` is 10 on both sides; the API's `MAX_UPLOAD_MB` setting is the one that
>   actually refuses anything.
> - Left for later phases on purpose: the Playwright e2e (`submit → pending → admin publishes →
>   Explore`, Phase 5) and any admin handling of the queue (Phase 4).
> - ⚠️ **Test files lost during Phase 3.** Four were deleted from the working tree without ever being
>   committed, so git could not return them: `src/lib/api.spec.ts`, `src/tests/ui-contract.spec.ts`,
>   `src/routes/proj-page.spec.ts`, `src/lib/components/ProjectCard.svelte.spec.ts`.
>   **`api.spec.ts` is back** (13 tests, green, committed in `828fe9e`). **Three are still missing**:
>   the UI contract, the project detail page and the card guards are not running. `route-contract.spec.ts`
>   and `ProjectBrowser`/`ProjectBody.svelte.spec.ts` now cover some of the same ground; recreating the
>   three proper specs is a Phase 5 item.

### Phase 4 — Admin
- [x] `/admin` login page (not linked from public nav): form action compares `ADMIN_PASSWORD` in
      constant time, then `cookies.set` HttpOnly / `SameSite=Strict` / `Secure`-in-prod /
      `path: '/admin'` / no `Max-Age`; explicit logout action; `robots.txt` blocks `/admin`
- [x] `admin-session.ts`: HMAC-signed token with expiry, verified server-side on every `/admin`
      `load`/action; failure → redirect to the login page (no client-only dashboard needed)
- [x] dashboard with pending / published / rejected / all filtering
- [x] edit project metadata + `body_markdown` in a textarea, live preview
- [x] status changes (pending / published / rejected) and delete with confirmation
- [x] explicit "update slug" control, separate from title editing
- [x] login throttling per IP in `hooks.server.ts`; `Cache-Control: no-store` on `/admin`
- [x] tests: login failure/success + session guard, publish transition, title edit leaves slug alone

> **Phase 4 notes.**
> - Files: `api/app/{auth.py,routers/admin.py,queries/admin.py}`,
>   `src/lib/{admin-session,admin-guard,admin-queue}.ts`,
>   `src/lib/components/{AdminQueue,AdminProjectEditor}.svelte`, `src/routes/admin/**` (sign-in,
>   `dashboard/` queue, `dashboard/[id]/` editor). FastAPI **verifies** the token and never issues one;
>   it has no login route and never sees the password.
> - `requireAdminToken(cookies)` is called by every admin `load` **and** every admin action: a form
>   action does not run the layout's guard, so a bare `curl POST` to `?/delete` reaches the action and
>   has to be stopped there.
> - Four actions (`?/save`, `?/slug`, `?/status`, `?/delete`) on four endpoints. `?/save` never sends
>   `slug` and never sends `status`, so neither moves as a side effect of fixing a typo; the slug moves
>   only from its own field behind its own button. Delete needs the confirmation box ticked and takes
>   the stored `.docx` with the row. Preview renders a draft the API never stored.
> - `/api/admin` is the only surface that returns submitter emails, so it is the only one behind the
>   bearer token. `hooks.server.ts` sets `Cache-Control: no-store` on every `/admin` response and caps
>   sign-in at 10 attempts / 15 min per client; `robots.txt` disallows `/admin`.
> - **Close-out check against the running stack, not just the tests:** unauthenticated
>   `GET /api/admin/projects?status=pending` → **401** with a sentence a person can read;
>   `/admin/dashboard` while signed out → **303 → /admin?out=expired**; `/openapi.json` lists all four
>   `/api/admin` paths (six operations).
> - **The `Error 503` on `GET /api/admin/projects?status=pending` was not a code fault.** The
>   `uvicorn` on `:8123` had been started by hand — `uv run uvicorn app.main:app --host 127.0.0.1
>   --port 8123`, **no `--reload`** — before `routers/admin.py` existed, so it served only
>   `/api/health` and the two public `/api/projects` paths and answered 404 for all of `/api/admin/*`,
>   which the web layer reports as 503. `/api/health` said `ok` the whole time, so nothing looked
>   broken. `missingApiRoutes()` had the answer already (`/api/admin/projects` absent from
>   `/openapi.json`), which is why the on-screen error named a stale process rather than saying
>   *Not Found*. Fix = kill it and `npm run api:dev`. **Rule: never start the API with a bare
>   `uv run uvicorn`** — without `--reload` the process goes stale the moment a router changes.
>   Operator-facing version in the README troubleshooting section.
> - Tests: **198 web** in 19 files (`admin-session` 40, `validation` 24, `antibot` 19,
>   `AdminProjectEditor` 19, `api.spec` 13, `admin-guard` 12, `rate-limit` 11, `hooks.server` 10,
>   `admin-queue`/`AdminQueue`/`route-contract` 5 each …) and **95 API** (`test_auth` 31,
>   `test_validate` 21, `test_admin` 16, `test_submissions` 13, `test_docx` 9, `test_rendering` 5).
>   `npm run check` 0 errors / 0 warnings, `npm run lint` clean.

---

### Phase 5 — hardening, docs, production shape
- [ ] `compose.yml` with `web` + `api` + `db`, named `db-data` and `uploads` volumes, no Traefik,
      `api`/`db` unpublished
- [ ] Dockerfiles for `api` (uv/`python:3.12-slim`) and `web` (multi-stage, `node:22-alpine`)
- [ ] structured error handling between web and api (timeouts, api-down message)
      - Partially done while debugging Phase 4: an unexpected `/api/admin/*` answer now quotes the
        path **and** the base URL it tried, because "`Error 503` + `Nothing was found there (404)`" was
        an `API_URL` aimed at another project's container on `:8000`, and nothing said so.
      - Done in the Phase 4.1 pass above: the same treatment for the submit path and for Explore.
      - Done: the startup line naming `API_URL` and what answered it.
      - Done: the stale-process trap that produced the admin page's `Error 503`, and the
        `openapi.json` / 401-vs-404 checks that catch it. Write-up in the Phase 4 notes above; the
        operator-facing version is in the README troubleshooting section.
- [ ] Recreate the three Phase 3 test files that were lost and never committed:
      `src/tests/ui-contract.spec.ts`, `src/routes/proj-page.spec.ts`,
      `src/lib/components/ProjectCard.svelte.spec.ts` (see the Phase 3 notes)
- [ ] Content-Security-Policy on pages that render submitted content (no inline scripts) — this is the
      main blast-radius limiter for the HttpOnly admin cookie, since those pages render `.docx` output
- [ ] README: local setup (`compose.local.yml up db` → migrate/seed → `npm run dev` + `uvicorn`)
- [ ] Playwright e2e: submit → pending → admin publishes → appears on Explore
- [ ] final pass: `npm run check`, `npm run lint`, `npm run test`

## Known simplifications to revisit

- `.docx` **images are not extracted** in the MVP (text, headings, lists, tables, links only).
  Extracting embedded media into the uploads volume and rewriting refs is deferred.
- Complex `.docx` formatting (styles, captions, footnotes, text boxes) degrades to plain Markdown.
- Rate limiting and login throttling are in-process in the web container → assumes one web replica.
- Session tokens are stateless, so logout cannot revoke a leaked token before its 8h expiry.
- One shared `ADMIN_PASSWORD`, so the queue cannot say **who** published or deleted something, and one
  admin cannot be removed without changing the password for all of them. Per-admin identities and an
  audit trail are v0.2.0 sized.
- An edit overwrites `body_markdown` in place — no drafts, no version history, and publishing an edit
  to a live project changes the public page immediately.
- Admins edit raw Markdown; no WYSIWYG.
- No submitter profile pages / author listing yet.

# v0.2.0 — First usable user flows to add projects and admin flows to edit and publish projects

import { defineConfig } from '@playwright/test';
import { ADMIN_PASSWORD, SESSION_SECRET } from './e2e/session.ts';

/**
 * End-to-end setup: a real FastAPI against a real Postgres, and a real production build of the web
 * app pointed at it.
 *
 * Both servers are started here rather than assumed, because the pairing is the thing worth testing —
 * `.docx` in, sanitized markup out, through the same signed-cookie handshake `/admin` uses. The
 * trade-offs, all deliberate:
 *
 * - **Ports 8124/4173, not 8123/8000/5173.** This is a shared machine with other projects whose
 *   containers hold 8000 and 5173, and a suite that silently tests somebody else's API is worse than
 *   one that fails to start. Override with `E2E_API_PORT` / `E2E_WEB_PORT`.
 * - **The web target is `node build`, not `vite preview`.** That is the process `compose.yml` runs, so
 *   the suite exercises adapter-node — including `BODY_SIZE_LIMIT`, which preview does not implement.
 * - **Its own `SESSION_SECRET` and `ADMIN_PASSWORD`,** from `e2e/session.ts`, handed to both processes
 *   so the cookie the web signs is the cookie the API verifies. They are throwaway constants on
 *   purpose: nothing real is read into this run, so no live credential appears in a test or a log.
 * - **The dev database, and no reset.** The suite files what it needs and deletes the project it made
 *   (`e2e/publishing.e2e.ts`). It asserts on the row it created, never on counts, so pre-existing rows
 *   from `npm run seed` cannot break it. A run that dies halfway leaves one pending row in the local
 *   queue — delete it at `/admin/dashboard/<id>`; that is the same cleanup a reviewer would do.
 *
 * Postgres has to be up first: `docker compose -f compose.local.yml up -d db`.
 */

const API_PORT = process.env.E2E_API_PORT ?? '8124';
const WEB_PORT = process.env.E2E_WEB_PORT ?? '4173';

export const baseURL = `http://localhost:${WEB_PORT}`;

/**
 * What Dokploy's Traefik would put on the request, faked here so the local run and the production run
 * agree about what a request looks like. `PROTOCOL_HEADER` and friends are set on the server below to
 * match, and adapter-node's default when it has nothing to read is `https` — which would make Kit
 * answer every form POST with 403 "Cross-site POST form submissions are forbidden". Sending the header
 * is the honest version of not setting the header at all: this is the code path behind the proxy.
 *
 * `X-Forwarded-For` is a TEST-NET address (RFC 5737) on purpose — the API rate-limits submissions per
 * client address, and this way the test client is a client rather than the Docker bridge.
 *
 * Exported because `e2e/security.e2e.ts` posts with Playwright's `request`, which is not a browser and
 * sends none of this on its own.
 */
export const forwarded = {
	'x-forwarded-proto': 'http',
	'x-forwarded-host': `localhost:${WEB_PORT}`,
	'x-forwarded-for': '203.0.113.7'
};

export default defineConfig({
	testMatch: '**/*.e2e.{ts,js}',
	// One worker: the suite walks one project through submit → review → publish → delete, and the
	// steps share it. Parallelism buys nothing here and would make the queue assertions a race.
	workers: 1,
	expect: { timeout: 10_000 },
	reporter: process.env.CI ? 'github' : [['list'], ['html', { open: 'never' }]],
	use: { baseURL, extraHTTPHeaders: forwarded },
	webServer: [
		{
			// The dev command, on its own port. `--reload` is harmless and means an API edit is picked
			// up without restarting Playwright. Migrations run at startup (api/app/main.py).
			command: 'npm run api:dev',
			env: { API_PORT, SESSION_SECRET, UPLOAD_DIR: './data/uploads' },
			url: `http://127.0.0.1:${API_PORT}/api/health`,
			reuseExistingServer: true,
			stdout: 'pipe',
			stderr: 'pipe',
			timeout: 60_000
		},
		{
			// Built fresh every run: the suite asserts on rendered markup, so it has to be this
			// checkout's build rather than whatever `build/` was left from.
			command: 'npm run build && node build',
			env: {
				PORT: WEB_PORT,
				HOST: '0.0.0.0',
				/** The same three lines `compose.yml` sets; see the `forwarded` note above. */
				PROTOCOL_HEADER: 'x-forwarded-proto',
				HOST_HEADER: 'x-forwarded-host',
				ADDRESS_HEADER: 'x-forwarded-for',
				API_URL: `http://127.0.0.1:${API_PORT}`,
				SESSION_SECRET,
				ADMIN_PASSWORD,
				BODY_SIZE_LIMIT: '12M'
			},
			url: baseURL,
			reuseExistingServer: false,
			stdout: 'pipe',
			stderr: 'pipe',
			// A cold `vite build` on a laptop is ~10s; the margin is for a loaded machine.
			timeout: 180_000
		}
	]
});

/**
 * Server hooks: identify the client, cap how often one client can post, and keep `/admin` uncacheable.
 *
 * Why the rate limits live here rather than in the form actions: this is the only place that runs
 * before SvelteKit reads a (possibly 10 MB) body, and it keeps the limit honest for every POST route
 * we add — `/submit`, and `/admin`'s sign-in.
 *
 * The bounce is a 303 back to the page with the wait in the query string, which works whether or not
 * the visitor has JavaScript: a browser follows the redirect, `enhance` follows it too, and both
 * `/submit` and `/admin` read `?limited=<seconds>` and say so above the form. Answering a form POST
 * with a bare 429 instead would leave a no-JS visitor staring at a status line.
 *
 * The limits are per web replica, in process memory (see `src/lib/rate-limit.ts`), and the submission
 * limit is set generously because Colby's traffic leaves the campus network through a handful of
 * egress IPs — a tight per-IP limit would throttle a whole building, not one person.
 *
 * The sign-in limit is the exception: the person who has to type an admin password a few times is one
 * person on one machine, and the thing we are slowing down is somebody working through passwords from
 * a shared campus egress IP. Ten tries a quarter hour per IP is the compromise.
 */

import { redirect } from '@sveltejs/kit';
import { describeApiTarget } from '#lib/api';
import { clientIp } from '#lib/antibot';
import { createRateLimiter } from '#lib/rate-limit';
import type { Handle } from '@sveltejs/kit/hooks';

/**
 * Name the API this process is about to talk to, at startup.
 *
 * Deliberately not awaited and not fatal: Explore has to come up even with the API down, and the
 * limiters and `no-store` below are the reason this module exists. What this buys is a log line — if
 * `API_URL` is aimed at something that is not this API, it is in the log before the first submitter
 * is told their write-up was "rejected".
 *
 * The retries are for `compose.yml`, where this container starts while the api is still applying
 * migrations: a startup line that says "is the api running?" about a process that answers ten seconds
 * later teaches whoever reads the log to ignore it.
 */
void describeApiTarget({ retries: 5 }).then((line) => console.info(`[techshare] ${line}`));

/** Write-up submissions: 12 per quarter hour per client. */
const submissions = createRateLimiter({ limit: 12, windowMs: 15 * 60 * 1000 });

/** Admin sign-in attempts: 10 per quarter hour per client. */
const adminLogins = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });

/** `/submit`'s action and nothing else. */
const SUBMIT_PATH = '/submit';
/** The sign-in form. Everything *under* `/admin` is already behind the session. */
const ADMIN_LOGIN_PATH = '/admin';
/** Every admin page: the login screen, the queue, the editor. */
const ADMIN_PREFIX = '/admin';

function isAdminPath(pathname: string): boolean {
	return pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`);
}

/**
 * `Cache-Control: no-store` on every admin response.
 *
 * The queue and the editor show one reviewer's view of unpublished work and a submitter's email
 * address; a shared cache — a browser's, a library proxy's, anything between here and a browser —
 * holding on to that for even a minute is a leak. `no-store` rather than `no-cache` because
 * `no-cache` still lets a cache keep a copy and ask, and there is nothing here worth the round trip.
 *
 * Rebuilding the Response is how a header gets added in a hook: `Response` headers are immutable, and
 * there is no `resolve` option for it.
 */
function noStore(response: Response): Response {
	const headers = new Headers(response.headers);
	headers.set('cache-control', 'no-store');
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.clientIp = clientIp(event);

	if (event.request.method === 'POST' && event.url.pathname === SUBMIT_PATH) {
		const outcome = submissions.consume(event.locals.clientIp);
		if (!outcome.allowed) {
			throw redirect(303, `${SUBMIT_PATH}?limited=${outcome.retryAfterSeconds}`);
		}
	}

	if (event.request.method === 'POST' && event.url.pathname === ADMIN_LOGIN_PATH) {
		const outcome = adminLogins.consume(event.locals.clientIp);
		if (!outcome.allowed) {
			throw redirect(303, `${ADMIN_LOGIN_PATH}?limited=${outcome.retryAfterSeconds}`);
		}
	}

	const response = await resolve(event);
	return isAdminPath(event.url.pathname) ? noStore(response) : response;
};

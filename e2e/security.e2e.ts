/**
 * The hardening from Phase 5, read off the wire rather than off the source.
 *
 * `src/csp.spec.ts` and `src/lib/admin-session.spec.ts` already pin these rules down as units — but a
 * unit test can only prove what the code *asks for*. These check what the running production server
 * actually sends, which is the part that protects a visitor: a directive dropped by a proxy, a cookie
 * flag lost to a refactor of the cookie helper, a login page that leaks the queue.
 *
 * One thing to know before editing: the CSRF check that would otherwise answer every request here with
 * 403 is explained in `playwright.config.ts` (`extraHTTPHeaders` + `PROTOCOL_HEADER`). If a POST in
 * this file starts failing with 403 "Cross-site…", that pairing broke — nothing else.
 *
 * Run: npx playwright test e2e/security.e2e.ts
 */

import { expect, test, type Page } from '@playwright/test';
import { signIn } from './session.ts';
import { baseURL, forwarded } from '../playwright.config.ts';

/**
 * Kit 3 rejects a form POST whose `Origin` is missing *or* does not match what the app believes its own
 * origin to be, and Playwright's `request` is a bare HTTP client: no `Origin`, no proxy headers, so
 * adapter-node would read the request as `https://…` and answer 403. A browser sends all of this; here
 * it is spelled out. The `page`-based tests get it from `extraHTTPHeaders` in the config.
 */
const asBrowserWould = { origin: baseURL, ...forwarded };

const SESSION_COOKIE = 'admin_session';

/** `script-src 'self' 'nonce-abc'` → `{ 'script-src': "'self' 'nonce-abc'" }`. */
function directives(header: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const part of header.split(';')) {
		const [name, ...rest] = part.trim().split(/\s+/);
		if (name) out[name] = rest.join(' ');
	}
	return out;
}

async function cspOn(page: Page, path: string): Promise<Record<string, string>> {
	const response = await page.goto(path);
	const header = response?.headers()['content-security-policy'];
	expect(header, `${path} arrived with no Content-Security-Policy header at all`).toBeTruthy();
	return directives(header!);
}

test.describe('response headers from the built server', () => {
	test('every document response carries the policy, with a nonce and no inline escape hatch', async ({
		page
	}) => {
		// One render with scripts, one without (an error page is a different code path through the same
		// hook), one behind auth. A policy that only lands on the home page protects nobody.
		for (const path of ['/', '/submit', '/admin', '/projects/no-such-write-up']) {
			const csp = await cspOn(page, path);

			expect(csp['default-src'], path).toBe("'self'");
			// The clause the project's own XSS defences come down to. `'unsafe-inline'` here would undo
			// `ProjectBody.svelte` and the API's sanitizer in one character, which is why the absence
			// check is spelled out even though `script-src` is already asserted below.
			expect(csp['script-src'], path).toContain("'self'");
			expect(csp['script-src'], path).not.toMatch(/unsafe-(inline|eval)/);
			// The one clause that is deliberately loose, and the reason is in `src/csp.ts`: Svelte inlines
			// component CSS and nonces do not apply to styles. Asserted rather than omitted so that if it
			// ever disappears, somebody has to go and delete the sentence that explains it.
			expect(csp['style-src'], path).toContain("'unsafe-inline'");
			expect(csp['img-src'], path).toContain('data:');
			expect(csp['font-src'], path).toBe("'self'");
			expect(csp['object-src'], path).toBe("'none'");
			expect(csp['frame-ancestors'], path).toBe("'none'");
			expect(csp['base-uri'], path).toBe("'none'");
			expect(csp['form-action'], path).toBe("'self'");
			// In production the browser talks to nobody but this origin. `ws:` belongs to the dev
			// server's hot reload only, and a stray `ws:` here means a dev directive leaked into a build.
			expect(csp['connect-src'], path).toBe("'self'");
			expect(csp['frame-src'], path).toBe("'none'");
		}

		// The nonce is per response, and its absence would mean scripts are running on `'self'` alone
		// with Kit unable to mark its own bootstrap script as ours.
		const home = await cspOn(page, '/');
		expect(home['script-src']).toMatch(/'nonce-[A-Za-z0-9+/=_-]{8,}'/);
	});

	test('the nonce differs between two requests for the same page', async ({ page }) => {
		// Two renders of the same page must not share a nonce: a per-response nonce is what stops somebody
		// saving one page's markup and having it execute under someone else's document.
		const first = await cspOn(page, '/');
		await page.reload();
		const second = await cspOn(page, '/');
		const nonce = (scriptSrc: string | undefined) => /'nonce-([^']+)'/.exec(scriptSrc ?? '')?.[1];
		expect(nonce(first['script-src'])).toBeTruthy();
		expect(nonce(second['script-src'])).toBeTruthy();
		expect(nonce(first['script-src'])).not.toBe(nonce(second['script-src']));
	});

	test('the session cookie is HttpOnly, SameSite=strict and Secure', async ({
		page,
		context,
		request
	}) => {
		// A wrong password answers 401 and hands out nothing — no half-session to trip over later.
		const wrong = await request.post('/admin', {
			form: { password: 'not-the-password' },
			headers: asBrowserWould
		});
		expect(wrong.status()).toBe(401);
		expect(wrong.headers()['set-cookie'] ?? '').toBe('');

		// The right password, through the form in a real browser. `signIn` is the point: it lands on the
		// dashboard, which only happens if the browser sent the cookie back on the next request — a header
		// dump on its own cannot prove that half.
		await signIn(page);

		const stored = (await context.cookies()).filter((c) => c.name === SESSION_COOKIE);
		expect(stored).toHaveLength(1);
		const cookie = stored[0]!;
		expect(cookie.httpOnly).toBe(true); // the page's own scripts cannot read it back
		expect(cookie.sameSite).toBe('Strict'); // nor does it travel with a click coming from elsewhere
		expect(cookie.path).toBe('/admin'); // only the queue asks for it, not the pages a submitter lands on
		// `Secure` is `!dev` (locked decision #6). Getting `true` here, over plain http, is Chromium
		// treating localhost as a trustworthy origin — so the e2e can run without a certificate and still
		// exercise the flag production ships with.
		expect(cookie.secure).toBe(true);
		// Browser-session on purpose: no `expires` on the wire. The eight hours live inside the signed
		// token and are enforced by `readToken`, whichever way the cookie happens to be stored.
		expect(cookie.expires).toBe(-1);
	});

	test('the queue does not render for a stranger', async ({ page }) => {
		await page.goto('/admin/dashboard');
		// Redirected to the sign-in page rather than answered with a 404. The `?out=expired` is deliberate:
		// `admin-guard.ts` treats no cookie, an expired one and a forged one as the same event, and the
		// query string only picks the sentence. What matters here is what came back in the body.
		await expect(page).toHaveURL(/\/admin\?out=expired$/);
		await expect(page.locator('input[name="password"]')).toBeVisible();
		await expect(page.locator('textarea[name="body_markdown"]')).toHaveCount(0);
		await expect(page.locator('table')).toHaveCount(0);
	});

	test('robots.txt keeps the queue out of the index', async ({ request }) => {
		const response = await request.get('/robots.txt');
		expect(response.status()).toBe(200);
		const body = await response.text();
		expect(body).toMatch(/Disallow: \/admin/i);
	});
});

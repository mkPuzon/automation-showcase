/**
 * The two things `hooks.server.ts` is responsible for: the caps, and `no-store` on `/admin`.
 *
 * Both are worth pinning because neither is visible from the pages they protect. A rate limiter that
 * silently counts the wrong thing looks identical to a limiter nobody has hit yet, and a missing
 * `Cache-Control` is a leak that shows up in someone else's browser history, not here.
 *
 * Run: npx vitest run src/hooks.server.spec.ts
 */

import { describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';

// `hooks.server.ts` probes the API once when the module loads, which is a real fetch to a real port.
// The hook under test does not use it, and a spec must not depend on what is listening on :8000.
vi.mock('#lib/api', () => ({ describeApiTarget: async () => 'mocked' }));

import { handle } from './hooks.server';

/** A marker from the page underneath, to prove the admin rewrite does not throw headers away. */
const MARKER = 'kept';

/**
 * The smallest thing `handle` actually uses: a URL, a method, an address, and a writable `locals`.
 * `clientIp` falls through to `getClientAddress` when no proxy headers are present, which is what
 * lets a test hand out distinct addresses.
 */
function event(path: string, { method = 'GET', ip = '10.0.0.1' } = {}): RequestEvent {
	const url = new URL(`http://localhost${path}`);
	return {
		request: new Request(url, { method }),
		url,
		locals: {},
		getClientAddress: () => ip
	} as unknown as RequestEvent;
}

/** Runs the hook and reports both halves: what came back, and whether the page ran at all. */
async function call(path: string, options: { method?: string; ip?: string } = {}) {
	let rendered = false;
	const resolve = async () => {
		rendered = true;
		return new Response('body', { status: 200, headers: { 'x-marker': MARKER } });
	};
	const input = { event: event(path, options), resolve } as unknown as Parameters<Handle>[0];
	const response = await handle(input);
	return { response, rendered };
}

/** Kit's redirect is a thrown object, not an exception type, so it is caught by shape. */
async function bounce(path: string, options: { method?: string; ip?: string }) {
	try {
		const { rendered } = await call(path, options);
		return { redirected: false as const, rendered };
	} catch (cause) {
		const { status, location } = cause as { status?: number; location?: string };
		return { redirected: true as const, status, location, rendered: false };
	}
}

describe('cache-control on admin', () => {
	it.each([
		['/admin', 'the sign-in page'],
		['/admin/dashboard', 'the queue'],
		['/admin/dashboard/42', 'one write-up']
	])('%s — %s', async (path) => {
		const { response } = await call(path);
		expect(response.headers.get('cache-control')).toBe('no-store');
	});

	it('adds the header without losing what the page already sent', async () => {
		const { response } = await call('/admin/dashboard');
		expect(response.headers.get('x-marker')).toBe(MARKER);
		expect(await response.text()).toBe('body');
	});

	it('leaves the public site alone', async () => {
		// Nothing here sets caching for public pages (they are cacheable by default and that is fine);
		// the hook's job is to not reach past /admin.
		for (const path of ['/', '/projects', '/submit', '/administrator']) {
			const response = (await call(path)).response;
			expect(response.headers.get('cache-control')).toBeNull();
		}
	});
});

describe('admin sign-in attempts', () => {
	it('lets ten through and bounces the eleventh, without reading the eleventh', async () => {
		const ip = '128.177.1.11';

		for (let attempt = 1; attempt <= 10; attempt += 1) {
			const { response, rendered } = await call('/admin', { method: 'POST', ip });
			expect(rendered).toBe(true);
			expect(response.status).toBe(200);
		}

		const bounced = await bounce('/admin', { method: 'POST', ip });
		expect(bounced.redirected).toBe(true);
		expect(bounced.status).toBe(303);
		expect(bounced.location).toMatch(/^\/admin\?limited=\d+$/);
		// The whole point of counting in a hook: the 10 MB body of a bounced attempt is never read.
		expect(bounced.rendered).toBe(false);
	});

	it('counts addresses separately, so one person does not throttle the building next door', async () => {
		const noisy = '128.177.2.20';
		for (let attempt = 0; attempt < 10; attempt += 1) {
			await call('/admin', { method: 'POST', ip: noisy });
		}
		expect((await bounce('/admin', { method: 'POST', ip: noisy })).redirected).toBe(true);

		const quiet = await call('/admin', { method: 'POST', ip: '128.177.3.30' });
		expect(quiet.rendered).toBe(true);
	});

	it('throttles the sign-in form only, not the queue behind it', async () => {
		const ip = '128.177.4.40';
		for (let attempt = 0; attempt < 12; attempt += 1) {
			// A signed-in reviewer can hammer the queue all afternoon; they already know the password.
			expect((await call('/admin/dashboard', { method: 'POST', ip })).rendered).toBe(true);
			expect((await call('/admin/dashboard/42?/delete', { method: 'POST', ip })).rendered).toBe(
				true
			);
		}
		expect((await call('/admin', { method: 'POST', ip })).rendered).toBe(true);
	});

	it('counts a GET as nothing at all', async () => {
		const ip = '128.177.5.50';
		for (let attempt = 0; attempt < 15; attempt += 1) {
			expect((await call('/admin', { ip })).rendered).toBe(true);
		}
	});
});

describe('submissions still have their own budget', () => {
	it('is not spent by signing in, and is spent by submitting', async () => {
		const ip = '128.177.6.60';

		// One sign-in attempt plus twelve submissions from the same address: both limits are generous
		// enough that neither should notice, which is the property that matters on a shared egress IP.
		expect((await call('/admin', { method: 'POST', ip })).rendered).toBe(true);
		for (let attempt = 1; attempt <= 12; attempt += 1) {
			expect((await call('/submit', { method: 'POST', ip })).rendered).toBe(true);
		}

		const bounced = await bounce('/submit', { method: 'POST', ip });
		expect(bounced.location).toMatch(/^\/submit\?limited=\d+$/);
	});
});

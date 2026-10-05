/**
 * Who gets past `/admin`.
 *
 * The token format is `admin-session.spec.ts`'s problem; this is the part that decides what to *do*
 * with the answer, and the two behaviours worth pinning are the ones that are invisible until they
 * break: a guard that lets a forged cookie through, and a sign-out that does not actually clear the
 * cookie (a `path` mismatch means the browser keeps the real one and the admin stays signed in while
 * believing they are not).
 *
 * Run: npx vitest run src/lib/admin-guard.spec.ts
 */

import { describe, expect, it } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import {
	DASHBOARD_PATH,
	EXPIRED_MESSAGE,
	SIGN_IN_PATH,
	SIGNED_OUT_MESSAGE,
	adminTokenFrom,
	configurationMessage,
	endSession,
	requireAdminToken,
	signOutMessage,
	startSession
} from '#lib/admin-guard';
import { SESSION_COOKIE, adminIsConfigured, mintToken, signSession } from '#lib/admin-session';

type Write = { name: string; value: string; opts: Record<string, unknown> };

/** A cookie jar with the three methods the guard uses, and a record of what was set. */
function jar(initial: Record<string, string> = {}): Cookies & { __set: Write[] } {
	const values = { ...initial };
	const writes: Write[] = [];
	const cookies = {
		get: (name: string) => values[name],
		getAll: () => values,
		set: (name: string, value: string, opts: Record<string, unknown> = {}) => {
			writes.push({ name, value, opts });
			values[name] = value;
		},
		setAll: () => {},
		delete: (name: string) => {
			delete values[name];
		},
		serialize: () => '',
		__set: writes
	};
	return cookies as unknown as Cookies & { __set: Write[] };
}

/** The last thing written to the jar. */
function lastSet(cookies: Cookies & { __set: Write[] }): Write | undefined {
	return cookies.__set.at(-1);
}

/** Kit's redirect is a thrown object with a status and a location, not an error subclass. */
function redirectOf(action: () => unknown): { status: number; location: string } | null {
	try {
		action();
		return null;
	} catch (cause) {
		const { status, location } = cause as { status?: number; location?: string };
		return { status: status ?? 0, location: location ?? '' };
	}
}

const LIVE = () => signSession();

/** Signed correctly, far in the past: right shape, wrong century. */
const ANCIENT = mintToken(
	{ issuedAt: 1_600_000_000, expiresAt: 1_600_028_800 },
	'whatever-the-secret-is'
);

describe('reading the cookie', () => {
	it('finds nothing when there is no cookie', () => {
		expect(adminTokenFrom(jar())).toBeNull();
	});

	it('finds nothing in a forgery or an expiry', () => {
		expect(adminTokenFrom(jar({ [SESSION_COOKIE]: 'admin' }))).toBeNull();
		expect(adminTokenFrom(jar({ [SESSION_COOKIE]: ANCIENT }))).toBeNull();
		const token = LIVE();
		expect(adminTokenFrom(jar({ [SESSION_COOKIE]: `${token.slice(0, -2)}zz` }))).toBeNull();
	});

	it('hands back the token when the cookie is live', () => {
		const token = LIVE();
		expect(adminTokenFrom(jar({ [SESSION_COOKIE]: token }))).toBe(token);
	});
});

describe('guarding a route', () => {
	it('returns the token the route will carry to the API', () => {
		const token = LIVE();
		const cookies = jar({ [SESSION_COOKIE]: token });
		expect(requireAdminToken(cookies)).toBe(token);
	});

	it('sends anyone without a live cookie to the sign-in page, with a reason', () => {
		for (const cookies of [
			jar(),
			jar({ [SESSION_COOKIE]: 'admin' }),
			jar({ [SESSION_COOKIE]: ANCIENT })
		]) {
			const bounce = redirectOf(() => requireAdminToken(cookies));
			expect(bounce?.status).toBe(303);
			expect(bounce?.location).toBe(`${SIGN_IN_PATH}?out=expired`);
		}
	});

	it('redirects rather than rendering, so nothing leaks the queue to a curl', () => {
		// 303 specifically: a 307 would re-POST a half-typed edit at the password form.
		expect(redirectOf(() => requireAdminToken(jar()))?.status).toBe(303);
	});
});

describe('signing in and out', () => {
	it('hands out the session under the one cookie name the API expects', () => {
		const cookies = jar();
		startSession(cookies);

		const write = lastSet(cookies);
		expect(write?.name).toBe(SESSION_COOKIE);
		expect(write?.opts.httpOnly).toBe(true);
		expect(write?.opts.sameSite).toBe('strict');
		expect(write?.opts.path).toBe('/admin');
		// No Max-Age (locked decision #6): a refresh keeps the queue, closing the browser does not.
		expect('maxAge' in (write?.opts ?? {})).toBe(false);

		// What was written is what a later request will read back.
		expect(adminTokenFrom(cookies)).toBe(write?.value);
	});

	it('clears the cookie with the same path it was set with', () => {
		const cookies = jar();
		startSession(cookies);
		endSession(cookies);

		const write = lastSet(cookies);
		expect(write?.value).toBe('');
		expect(write?.opts.maxAge).toBe(0);
		// The attribute that makes logout work at all: a cookie set for /admin is not cleared by a
		// Set-Cookie for /.
		expect(write?.opts.path).toBe('/admin');
		expect(adminTokenFrom(cookies)).toBeNull();
	});

	it('signs out of a session it never issued', () => {
		const cookies = jar({ [SESSION_COOKIE]: LIVE() });
		endSession(cookies);
		expect(adminTokenFrom(cookies)).toBeNull();
	});
});

describe('what the sign-in page is told', () => {
	it('explains an expired session and a sign-out, and nothing else', () => {
		expect(signOutMessage('expired')).toBe(EXPIRED_MESSAGE);
		expect(signOutMessage('signed-out')).toBe(SIGNED_OUT_MESSAGE);
		expect(signOutMessage('whatever')).toBeNull();
		expect(signOutMessage(null)).toBeNull();
	});

	it('names the setting that is missing, and only when it is missing', () => {
		const message = configurationMessage();
		if (adminIsConfigured()) {
			expect(message).toBeNull();
		} else {
			expect(message).toContain('ADMIN_PASSWORD');
		}
	});

	it('keeps the two paths the routes hardcode', () => {
		expect(SIGN_IN_PATH).toBe('/admin');
		expect(DASHBOARD_PATH).toBe('/admin/dashboard');
	});
});

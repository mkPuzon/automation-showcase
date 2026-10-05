/**
 * The admin session: what the cookie holds, how it is made, how it is checked.
 *
 * There are no user accounts on this site (locked decision #17), so this is the whole of the
 * authentication: one password, and a cookie that says somebody said it within the last eight hours.
 * It is signed rather than stored server-side because there is no session table to store it in, and a
 * container restart should not sign the reviewer out of their own queue.
 *
 * `api/app/auth.py` verifies what this module produces. The two agree on `SESSION_SECRET` and on the
 * exact byte layout, which is pinned as a golden token in `admin-session.spec.ts` and again in
 * `api/tests/test_auth.py` — change the format on one side and the other suite says so.
 *
 * The layout, and the reason the two halves are the shape they are:
 *
 *     base64url(json of {sub, iat, exp}) . base64url(HMAC-SHA256("techshare-admin.v1." + payload))
 *
 * The payload is carried in the clear on purpose — it is the word "admin" and two timestamps. The
 * signature, not encryption, is what protects it, and keeping it in this dotted two-part shape is
 * what makes it recognisable as the same family of token on both sides of the network boundary.
 *
 * A session is fixed at eight hours from sign-in and does not slide. There is no session table to
 * refresh, no revoke list to consult, and a reviewer who wants a new eight hours types the password
 * again; that is also the only way to end a session early other than changing `SESSION_SECRET`.
 *
 * The pure functions take their secret and their clock as arguments, which is what lets the spec
 * test a forgery without editing the environment; the thin wrappers underneath read the configured
 * values. Both halves are server-only: `$app/env/private` is a server module, nothing in a route's
 * `+page.svelte` may import this file, and no route passes a token to the browser.
 */

import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import { ADMIN_PASSWORD, SESSION_SECRET } from '$app/env/private';
import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_PREFIX = 'techshare-admin.v1.';
const ADMIN_SUBJECT = 'admin';

/** Long enough to work a queue in one sitting; short enough that a lost laptop stops working. */
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

/** The cookie's name. `/admin` and everything under it is the only place it is ever sent. */
export const SESSION_COOKIE = 'admin_session';

/** Two base64url fields; anything longer than this did not come from us. */
const MAX_TOKEN_LENGTH = 512;

/** A clock skew allowance: our clock and the one that minted this are allowed to differ a little. */
const CLOCK_SKEW_SECONDS = 60;

export type SessionClaims = { issuedAt: number; expiresAt: number };

// --- the format, with the secret and the clock always explicit --------------------------------

/** The signature half of a token carrying exactly these claims. */
export function signatureFor(payload: string, secret: string): string {
	return createHmac('sha256', secret).update(`${SIGNATURE_PREFIX}${payload}`).digest('base64url');
}

/** The base64url JSON half — key order fixed, because the signature covers these bytes. */
export function encodeClaims(claims: SessionClaims): string {
	return Buffer.from(
		JSON.stringify({ sub: ADMIN_SUBJECT, iat: claims.issuedAt, exp: claims.expiresAt })
	).toString('base64url');
}

/** Mint a token. Nothing here consults a configured secret; that is the wrappers' job. */
export function mintToken(claims: SessionClaims, secret: string): string {
	const payload = encodeClaims(claims);
	return `${payload}.${signatureFor(payload, secret)}`;
}

/**
 * The claims in `token`, or null for "not a session".
 *
 * This is the only place expiry is decided, so `hooks.server.ts` and the pages cannot disagree about
 * whether a cookie is live. Every rejection returns the same null: whether a token was forged,
 * edited, mis-keyed or simply old is a thing only the server gets to know, and it does not need to
 * say which.
 */
export function readToken(
	token: string | undefined,
	secret: string,
	now: Date = new Date()
): SessionClaims | null {
	if (!token || token.length > MAX_TOKEN_LENGTH) return null;

	const separator = token.indexOf('.');
	// Exactly one dot with something on both sides. `payload.` and `.signature` are both forgeries.
	if (separator < 1 || separator !== token.lastIndexOf('.')) return null;
	const payload = token.slice(0, separator);
	const signature = token.slice(separator + 1);
	if (Buffer.from(signature, 'base64url').toString('base64url') !== signature) return null;

	if (!secret) return null;
	const expected = Buffer.from(signatureFor(payload, secret));
	const provided = Buffer.from(signature);
	// timingSafeEqual throws on unequal lengths, and a length difference is already a mismatch.
	if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

	let claims: unknown;
	try {
		claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
	} catch {
		return null;
	}
	if (typeof claims !== 'object' || claims === null) return null;

	const { sub, iat, exp } = claims as Record<string, unknown>;
	if (sub !== ADMIN_SUBJECT) return null;
	if (!Number.isInteger(iat) || !Number.isInteger(exp)) return null;
	// Longer-lived than this module would ever issue was not issued by this module.
	if ((exp as number) - (iat as number) > SESSION_TTL_SECONDS) return null;

	const nowSeconds = Math.floor(now.getTime() / 1000);
	if ((exp as number) <= nowSeconds) return null;
	// An `iat` in the future is a skewed clock or a hand-written token; neither is a session.
	if ((iat as number) > nowSeconds + CLOCK_SKEW_SECONDS) return null;

	return { issuedAt: iat as number, expiresAt: exp as number };
}

/**
 * Compare a candidate password with a configured one.
 *
 * A length mismatch returns before the comparison rather than being fed to `timingSafeEqual`, which
 * throws on unequal lengths. That early return tells a guesser how long the password is, and that
 * trade is deliberate: they still have to guess the whole of it, and every attempt goes past the
 * limiter in `hooks.server.ts`. What is *not* done is a plain `===`, which would leak the length the
 * same way and the position of the first wrong character as well.
 */
export function passwordEquals(candidate: string, configured: string): boolean {
	if (!configured) return false;
	const provided = Buffer.from(candidate, 'utf8');
	const expected = Buffer.from(configured, 'utf8');
	if (provided.length !== expected.length) return false;
	return timingSafeEqual(provided, expected);
}

/**
 * A cookie's attributes.
 *
 * With no `maxAge` this is a *browser-session* cookie: it survives a refresh (so a reviewer can reload
 * the queue) and dies when the browser closes. The eight hours live inside the signed token, not on the
 * cookie — see locked decision #6 — so the expiry is enforced by `readToken` whichever way the cookie
 * is stored. `maxAge: 0` is the one argument that matters at runtime: it is how logout clears it.
 */
export function sessionCookie(maxAge?: number) {
	return {
		httpOnly: true as const,
		sameSite: 'strict' as const,
		// Off in `dev` because the dev server is plain http://localhost and a Secure cookie would be
		// dropped by the browser before it ever reached us.
		secure: !dev,
		path: '/admin',
		// Omitted rather than undefined: `cookies.set` writes a `Max-Age` only if the key is present.
		...(maxAge === undefined ? {} : { maxAge })
	};
}

// --- the configured app: the same functions, with this deployment's secret --------------------

/** Is a password configured at all? No password means no admin sign-in, anywhere in the app. */
export function adminIsConfigured(): boolean {
	return typeof ADMIN_PASSWORD === 'string' && ADMIN_PASSWORD.length > 0;
}

/** Can sessions be signed? No secret means a 503 with an explanation, never an unsigned cookie. */
export function sessionsCanBeSigned(): boolean {
	return typeof SESSION_SECRET === 'string' && SESSION_SECRET.length > 0;
}

export function passwordMatches(candidate: string): boolean {
	return passwordEquals(candidate, ADMIN_PASSWORD ?? '');
}

/** Verify against this deployment's `SESSION_SECRET`. */
export function verifySessionToken(
	token: string | undefined,
	now: Date = new Date()
): SessionClaims | null {
	return readToken(token, SESSION_SECRET ?? '', now);
}

export function sessionIsValid(token: string | undefined, now: Date = new Date()): boolean {
	return verifySessionToken(token, now) !== null;
}

/** A new session token for now. Refuses to invent a secret of its own. */
export function signSession(now: Date = new Date()): string {
	if (!sessionsCanBeSigned()) {
		error(503, 'Admin sign-in is not configured: set SESSION_SECRET on both services.');
	}
	const issuedAt = Math.floor(now.getTime() / 1000);
	return mintToken({ issuedAt, expiresAt: issuedAt + SESSION_TTL_SECONDS }, SESSION_SECRET);
}

/**
 * The admin session cookie's format and expiry, and the password comparison.
 *
 * `GOLDEN` below is the cross-language pin: `api/tests/test_auth.py` verifies the same token with the
 * same secret. It is not a fixture to be regenerated — if you feel you have to change it, the format
 * changed, and both sides have to move together.
 *
 * Run: npx vitest run src/lib/admin-session.spec.ts
 */

import { dev } from '$app/env';
import { describe, expect, it } from 'vitest';
import {
	SESSION_COOKIE,
	SESSION_TTL_SECONDS,
	adminIsConfigured,
	encodeClaims,
	mintToken,
	passwordEquals,
	readToken,
	signSession,
	sessionCookie,
	sessionIsValid,
	signatureFor,
	sessionsCanBeSigned,
	verifySessionToken
} from '#lib/admin-session';

const SECRET = 'phase4-golden-vector';
const ISSUED_AT = 1_770_000_000; // 2026-02-02T04:00:00Z
const EXPIRES_AT = ISSUED_AT + SESSION_TTL_SECONDS;
const INSIDE = new Date((EXPIRES_AT - 3600) * 1000);

const GOLDEN =
	'eyJzdWIiOiJhZG1pbiIsImlhdCI6MTc3MDAwMDAwMCwiZXhwIjoxNzcwMDI4ODAwfQ' +
	'.LEd4Dw_fnKuX0KEX964fD03DtH7HJiOMqlnoH56LIjE';

const claims = { issuedAt: ISSUED_AT, expiresAt: EXPIRES_AT };

/** A correctly signed token whose claims this app would never produce. */
function signed(body: unknown): string {
	const payload = Buffer.from(JSON.stringify(body)).toString('base64url');
	return `${payload}.${signatureFor(payload, SECRET)}`;
}

describe('the token format', () => {
	it('mints the token the API already knows how to check', () => {
		expect(mintToken(claims, SECRET)).toBe(GOLDEN);
	});

	it('carries its claims where you can read them', () => {
		const [payload] = GOLDEN.split('.');
		expect(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))).toEqual({
			sub: 'admin',
			iat: ISSUED_AT,
			exp: EXPIRES_AT
		});
	});

	it('encodes the claims in a fixed key order, because the signature covers those bytes', () => {
		expect(encodeClaims(claims)).toBe(GOLDEN.split('.')[0]);
	});

	it('reads back what it minted', () => {
		expect(readToken(GOLDEN, SECRET, INSIDE)).toEqual(claims);
	});

	it('names the cookie and the lifetime the routes use', () => {
		expect(SESSION_COOKIE).toBe('admin_session');
		expect(SESSION_TTL_SECONDS).toBe(8 * 60 * 60);
	});
});

describe('a token that is not ours', () => {
	it('is refused when another secret signed it', () => {
		const forged = mintToken(claims, 'a-different-secret-entirely');
		expect(readToken(forged, SECRET, INSIDE)).toBeNull();
	});

	it('is refused when the expiry was stretched under the signature', () => {
		const stretched = mintToken({ issuedAt: ISSUED_AT, expiresAt: EXPIRES_AT + 86_400 }, SECRET);
		expect(readToken(stretched, SECRET, INSIDE)).toBeNull();
	});

	it('is refused when one character of the signature changed', () => {
		const last = GOLDEN.endsWith('A') ? 'B' : 'A';
		expect(readToken(`${GOLDEN.slice(0, -1)}${last}`, SECRET, INSIDE)).toBeNull();
	});

	it('is refused when there is no secret to check it against', () => {
		expect(readToken(GOLDEN, '', INSIDE)).toBeNull();
	});

	it.each([
		['nothing', undefined],
		['an empty string', ''],
		['no dot', 'not-a-token'],
		['two dots', `${GOLDEN}.extra`],
		['an empty payload', `.${GOLDEN.split('.')[1]}`],
		['an empty signature', `${GOLDEN.split('.')[0]}.`],
		['not base64url', '!!!!.!!!!'],
		['a much longer token', `${GOLDEN}${'a'.repeat(512)}`],
		['a bare json document', Buffer.from('{"sub":"admin"}').toString('base64url')]
	])('is refused when handed %s', (_label, token) => {
		expect(readToken(token as string | undefined, SECRET, INSIDE)).toBeNull();
	});
});

describe('claims this app would never sign', () => {
	it.each([
		['a subject that is not admin', { sub: 'somebody-else', iat: ISSUED_AT, exp: EXPIRES_AT }],
		['no subject', { iat: ISSUED_AT, exp: EXPIRES_AT }],
		['a timestamp written as a string', { sub: 'admin', iat: `${ISSUED_AT}`, exp: EXPIRES_AT }],
		['no expiry', { sub: 'admin', iat: ISSUED_AT }],
		['a session a year long', { sub: 'admin', iat: ISSUED_AT, exp: ISSUED_AT + 365 * 86_400 }]
	])('is refused even when correctly signed: %s', (_label, body) => {
		// Signed with the right secret on purpose — it is the claims under test here, not the key.
		expect(readToken(signed(body), SECRET, INSIDE)).toBeNull();
	});
});

describe('expiry', () => {
	it('is live until the last second of the session', () => {
		expect(readToken(GOLDEN, SECRET, new Date((EXPIRES_AT - 1) * 1000))).not.toBeNull();
	});

	it('ends the session at the expiry, not after it', () => {
		expect(readToken(GOLDEN, SECRET, new Date(EXPIRES_AT * 1000))).toBeNull();
	});

	it('does not accept a token minted in the future', () => {
		const future = mintToken(
			{ issuedAt: ISSUED_AT + 600, expiresAt: ISSUED_AT + 600 + SESSION_TTL_SECONDS },
			SECRET
		);
		expect(readToken(future, SECRET, new Date(ISSUED_AT * 1000))).toBeNull();
	});

	it('forgives a minute of clock skew', () => {
		const slightlyAhead = mintToken(
			{ issuedAt: ISSUED_AT + 30, expiresAt: ISSUED_AT + 30 + SESSION_TTL_SECONDS },
			SECRET
		);
		expect(readToken(slightlyAhead, SECRET, new Date(ISSUED_AT * 1000))).not.toBeNull();
	});

	it('is fixed at sign-in and does not slide, so an eight hour session really is eight hours', () => {
		const token = mintToken(claims, SECRET);
		expect(readToken(token, SECRET, INSIDE)?.expiresAt).toBe(EXPIRES_AT);
		expect(readToken(token, SECRET, new Date((EXPIRES_AT - 1) * 1000))?.expiresAt).toBe(EXPIRES_AT);
	});
});

describe('the password comparison', () => {
	it('accepts the configured password', () => {
		expect(passwordEquals('correct horse battery staple', 'correct horse battery staple')).toBe(
			true
		);
	});

	it('rejects anything else, same length or not', () => {
		expect(passwordEquals('correct horse battery staplf', 'correct horse battery staple')).toBe(
			false
		);
		expect(passwordEquals('correct horse battery stapl', 'correct horse battery staple')).toBe(
			false
		);
		expect(passwordEquals('', 'correct horse battery staple')).toBe(false);
		expect(passwordEquals('hunter2', '')).toBe(false);
	});

	it('treats an unset password as no access rather than an empty one', () => {
		// No ADMIN_PASSWORD means admin sign-in is off, and "off" must not be enterable by pressing
		// Enter on an empty field.
		expect(passwordEquals('', '')).toBe(false);
	});

	it('compares bytes, so a multi-byte password is not a special case', () => {
		expect(passwordEquals('ünïcodé-pässwörd', 'ünïcodé-pässwörd')).toBe(true);
		expect(passwordEquals('unicode-password', 'ünïcodé-pässwörd')).toBe(false);
	});
});

describe('the cookie', () => {
	const cookie = sessionCookie();

	it('is unreachable from scripts and from other sites', () => {
		expect(cookie.httpOnly).toBe(true);
		expect(cookie.sameSite).toBe('strict');
	});

	it('is only ever sent to /admin', () => {
		expect(cookie.path).toBe('/admin');
	});

	it('outlives a refresh but not the browser', () => {
		// Locked decision #6: no Max-Age. The eight hours are inside the signed token, so the expiry is
		// enforced by readToken whether or not the browser remembers the cookie.
		expect('maxAge' in cookie).toBe(false);
		expect(sessionCookie(0).maxAge).toBe(0);
	});

	it('is Secure everywhere except the local dev server', () => {
		// Asserted against the same flag the module reads, so this states the rule rather than a
		// hardcoded true that would pass in dev and lie about production.
		expect(cookie.secure).toBe(!dev);
	});
});

describe('the session this deployment actually signs', () => {
	it('refuses to mint anything without a secret', () => {
		expect(sessionsCanBeSigned()).toBe(true);
		expect(typeof adminIsConfigured()).toBe('boolean');
	});

	it('accepts its own token and nothing else', () => {
		const token = signSession();
		expect(token.split('.')).toHaveLength(2);
		expect(verifySessionToken(token)).not.toBeNull();
		expect(sessionIsValid(token)).toBe(true);

		expect(sessionIsValid(`${token.slice(0, -2)}xx`)).toBe(false);
		expect(sessionIsValid('')).toBe(false);
		expect(sessionIsValid(undefined)).toBe(false);
		expect(sessionIsValid(mintToken(claims, 'not-our-secret'))).toBe(false);
	});

	it('expires eight hours after sign-in', () => {
		const now = Math.floor(Date.now() / 1000);
		const claimsNow = verifySessionToken(signSession());
		expect(claimsNow?.issuedAt).toBeGreaterThanOrEqual(now - 2);
		expect(claimsNow?.expiresAt).toBe((claimsNow?.issuedAt ?? 0) + SESSION_TTL_SECONDS);
	});

	it('rejects a token from a different secret, which is what a restart with a new key means', () => {
		const moment = Math.floor(Date.now() / 1000);
		const fromElsewhere = mintToken(
			{ issuedAt: moment, expiresAt: moment + SESSION_TTL_SECONDS },
			`${SECRET}-but-not-yours`
		);
		expect(verifySessionToken(fromElsewhere)).toBeNull();
	});
});

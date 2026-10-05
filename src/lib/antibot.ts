/**
 * Anti-bot without a third-party CAPTCHA (locked decision #7): a honeypot field, a minimum
 * render→submit delay, and a per-IP rate limit.
 *
 * The render token is what makes the delay enforceable. `load` for `/submit` stamps the page with
 * `"<epoch-ms>.<hmac>"`; a bot that posts without ever rendering the form has no token at all, and
 * one that posts immediately fails the minimum-age check. Signing it means a bot cannot simply write
 * a big timestamp into the field — it would have to compute an HMAC with `SESSION_SECRET`, which
 * only the web process knows.
 *
 * All of this is a speed bump for automated junk, not a defense against a determined person: the
 * real gate is a human admin reading the write-up before it is published.
 *
 * Server-only (`node:crypto`). The honeypot's *name* lives in `#lib/validation` so the browser
 * bundle does not pull this file in.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Wait this long between the page rendering and the submit being accepted. */
export const MIN_RENDER_AGE_MS = 3000;
/** Longer than this and the page is stale (someone left the tab open) — ask for a fresh one. */
export const MAX_RENDER_AGE_MS = 60 * 60 * 1000;

export const TOO_FAST_MESSAGE =
	'That arrived faster than a person types. Take another look at the form and submit it again.';
export const STALE_FORM_MESSAGE =
	'That form page has been open for a while. Reload it and submit again — nothing was saved.';
export const NO_FORM_MESSAGE =
	'That submission did not come from the submit page. Open the form and use its submit button.';

/** Fallback key so `npm run dev` works with no SESSION_SECRET; tokens then die with the process. */
const EPHEMERAL_SECRET = randomBytes(32).toString('hex');

function key(secret: string): string {
	return secret.trim() === '' ? EPHEMERAL_SECRET : secret;
}

function sign(payload: string, secret: string): string {
	return createHmac('sha256', key(secret)).update(`submit:${payload}`).digest('base64url');
}

export function issueRenderToken(secret: string, now: number = Date.now()): string {
	const payload = String(now);
	return `${payload}.${sign(payload, secret)}`;
}

export type RenderTokenProblem = 'missing' | 'tampered' | 'too-fast' | 'expired';

export interface RenderTokenCheck {
	ok: boolean;
	problem: RenderTokenProblem | null;
	/** Null when the token was missing or unreadable. */
	ageMs: number | null;
}

const TOKEN_OK: RenderTokenCheck = { ok: true, problem: null, ageMs: 0 };

/** Verify a token from the form and check how old it is. Never throws on garbage input. */
export function checkRenderToken(
	value: FormDataEntryValue | string | null,
	secret: string,
	now: number = Date.now()
): RenderTokenCheck {
	const token = typeof value === 'string' ? value : '';
	const [payload, signature, ...extra] = token.split('.');
	if (!payload || !signature || extra.length > 0 || !/^\d{1,20}$/.test(payload)) {
		return { ok: false, problem: 'missing', ageMs: null };
	}

	const expected = Buffer.from(sign(payload, secret), 'base64url');
	const given = Buffer.from(signature, 'base64url');
	if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
		return { ok: false, problem: 'tampered', ageMs: null };
	}

	const ageMs = now - Number(payload);
	if (ageMs < 0) {
		// The token is stamped by this process, so a negative age means the clock went backwards.
		return { ok: false, problem: 'tampered', ageMs };
	}
	if (ageMs > MAX_RENDER_AGE_MS) return { ok: false, problem: 'expired', ageMs };
	if (ageMs < MIN_RENDER_AGE_MS) return { ok: false, problem: 'too-fast', ageMs };
	return { ...TOKEN_OK, ageMs };
}

export function renderTokenMessage(check: RenderTokenCheck): string {
	if (check.problem === 'expired') return STALE_FORM_MESSAGE;
	if (check.problem === 'too-fast') return TOO_FAST_MESSAGE;
	return NO_FORM_MESSAGE;
}

/**
 * The IP to rate limit, preferring what Dokploy's proxy tells us.
 *
 * Deliberately *not* the left-most `X-Forwarded-For` entry: Traefik appends to that header, so the
 * left-most value is whatever the client chose to send. `X-Real-IP` is the address the proxy
 * connected from, and the right-most XFF entry is the next best thing. With no proxy in front (the
 * dev machine) SvelteKit's own answer is the truth.
 */
export function clientIp(event: { request: Request; getClientAddress(): string }): string {
	const headers = event.request.headers;

	const realIp = headers.get('x-real-ip')?.trim();
	if (realIp) return realIp;

	const forwarded = headers.get('x-forwarded-for');
	if (forwarded) {
		const hops = forwarded
			.split(',')
			.map((hop) => hop.trim())
			.filter(Boolean);
		const last = hops.at(-1);
		if (last) return last;
	}

	return event.getClientAddress();
}

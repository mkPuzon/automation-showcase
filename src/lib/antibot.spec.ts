/**
 * The anti-bot speed bumps: the signed render token (a form that was never rendered, and a submit
 * that came faster than a person types) and the proxy-aware client address the rate limiter keys on.
 */

import { describe, expect, it } from 'vitest';
import {
	MAX_RENDER_AGE_MS,
	MIN_RENDER_AGE_MS,
	NO_FORM_MESSAGE,
	STALE_FORM_MESSAGE,
	TOO_FAST_MESSAGE,
	checkRenderToken,
	clientIp,
	issueRenderToken,
	UNKNOWN_CLIENT,
	renderTokenMessage
} from '#lib/antibot';

const SECRET = 'test-secret-not-used-anything-real';
const RENDERED_AT = 1_760_000_000_000;

function event(headers: Record<string, string>, direct = '127.0.0.1') {
	return {
		request: new Request('http://localhost:5173/submit', { headers }),
		getClientAddress: () => direct
	};
}

describe('render token', () => {
	it('accepts a token that has aged past the minimum delay', () => {
		const token = issueRenderToken(SECRET, RENDERED_AT);
		const check = checkRenderToken(token, SECRET, RENDERED_AT + MIN_RENDER_AGE_MS + 5000);

		expect(check.ok).toBe(true);
		expect(check.problem).toBeNull();
		expect(check.ageMs).toBe(MIN_RENDER_AGE_MS + 5000);
	});

	it('bounces a submit that arrived before the minimum delay', () => {
		const token = issueRenderToken(SECRET, RENDERED_AT);
		const check = checkRenderToken(token, SECRET, RENDERED_AT + 400);

		expect(check).toMatchObject({ ok: false, problem: 'too-fast' });
		expect(renderTokenMessage(check)).toBe(TOO_FAST_MESSAGE);
	});

	it('calls a form left open past its lifetime stale', () => {
		const token = issueRenderToken(SECRET, RENDERED_AT);
		const check = checkRenderToken(token, SECRET, RENDERED_AT + MAX_RENDER_AGE_MS + 1);

		expect(check.problem).toBe('expired');
		expect(renderTokenMessage(check)).toBe(STALE_FORM_MESSAGE);
	});

	describe('forged or missing tokens', () => {
		const token = issueRenderToken(SECRET, RENDERED_AT);
		const [payload, signature] = token.split('.');
		const now = RENDERED_AT + 60_000;

		it.each([
			['no token at all', ''],
			['blank space', '   '],
			['a bare timestamp', payload],
			['an edited signature', `${payload}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`],
			['an extra segment', `${token}.extra`],
			['a non-numeric timestamp', 'soon.ABC'],
			['a signature from another secret', issueRenderToken('other-secret', RENDERED_AT)],
			['a timestamp in the future', issueRenderToken(SECRET, RENDERED_AT + MAX_RENDER_AGE_MS * 2)]
		])('refuses %s', (_label, value) => {
			expect(checkRenderToken(value, SECRET, now).ok).toBe(false);
		});

		it('refuses a file where the token should be', () => {
			const upload = new File([token], 'render_token');
			expect(checkRenderToken(upload, SECRET, now).ok).toBe(false);
		});

		it('keeps a valid signature valid', () => {
			expect(checkRenderToken(token, SECRET, now).ok).toBe(true);
			expect(signature).toBeTruthy();
		});
	});

	it('says nothing useful to whoever posted without the form', () => {
		const check = checkRenderToken(null, SECRET);
		expect(check.problem).toBe('missing');
		expect(renderTokenMessage(check)).toBe(NO_FORM_MESSAGE);
	});

	it('still works with no SESSION_SECRET, using a per-process key', () => {
		const token = issueRenderToken('', RENDERED_AT);
		expect(checkRenderToken(token, '', RENDERED_AT + 60_000).ok).toBe(true);
	});

	it('cannot be reused with the payload edited', () => {
		const [stamp, signature] = issueRenderToken(SECRET, RENDERED_AT).split('.');
		const edited = `${Number(stamp) - 10 * 60 * 1000}.${signature}`;

		expect(checkRenderToken(edited, SECRET, RENDERED_AT + 60_000).problem).toBe('tampered');
	});
});

describe('clientIp', () => {
	it('prefers the address the proxy connected from', () => {
		const ip = clientIp(
			event({ 'x-real-ip': '140.14.51.9', 'x-forwarded-for': '203.0.113.9, 10.0.0.5' })
		);
		expect(ip).toBe('140.14.51.9');
	});

	it('falls back to the right-most forwarded hop, never the client-supplied first one', () => {
		const ip = clientIp(event({ 'x-forwarded-for': '198.51.100.7, 140.14.51.9' }));
		expect(ip).toBe('140.14.51.9');
	});

	it('uses SvelteKit’s own answer with no proxy in front', () => {
		expect(clientIp(event({}, '127.0.0.1'))).toBe('127.0.0.1');
	});

	it('shares one bucket rather than failing the page when the proxy header is missing', () => {
		// Verbatim what adapter-node does when ADDRESS_HEADER is set (compose.yml) and a request arrives
		// without going through the proxy — a container-local health check, or Playwright's readiness
		// probe. A 500 on the home page was the old behaviour.
		const withoutProxyHeader = {
			request: new Request('http://localhost:4173/'),
			getClientAddress: () => {
				throw new Error(
					'Address header was specified with ADDRESS_HEADER=x-forwarded-for but is absent'
				);
			}
		};
		expect(clientIp(withoutProxyHeader)).toBe(UNKNOWN_CLIENT);
	});
});

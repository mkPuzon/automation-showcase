/**
 * The CSP policy as a contract, checked without a browser.
 *
 * The header itself is asserted end-to-end in `e2e/security.e2e.ts`, against a real production build
 * in a real Chromium (that is the only place "the browser actually enforced it" can be shown). This
 * file guards the *shape* of the policy, because the way this stops being true is quiet: someone adds
 * `'unsafe-inline'` to `script-src` to fix one broken page, ships it, and the site still looks fine
 * while the one header that limits what submitted markup can do is gone.
 *
 * Run: npx vitest run src/csp.spec.ts
 */

import { describe, expect, it } from 'vitest';
import { cspDirectives } from './csp';

const prod = cspDirectives();
const dev = cspDirectives({ dev: true });

/** The directives that would hand a script to the browser, whichever way they are spelled. */
const SCRIPT_DIRECTIVES = ['script-src', 'script-src-elem', 'script-src-attr', 'default-src'];

describe('content security policy', () => {
	it('lets nothing execute that did not come from this origin with a nonce', () => {
		// The whole point: Kit adds `'nonce-…'` to whatever it inlines, and a script arriving inside a
		// .docx cannot have one. 'unsafe-inline'/'unsafe-eval' would undo that permanently, and neither
		// has ever been needed here — Svelte compiles handlers to addEventListener, not to attributes.
		expect(prod['script-src']).toEqual(['self']);
		expect(prod['script-src-elem']).toBeUndefined();
		expect(prod['script-src-attr']).toBeUndefined();
	});

	it('never puts an unsafe script source in any script position, prod or dev', () => {
		for (const [where, policy] of [
			['production', prod],
			['development', dev]
		] as const) {
			for (const directive of SCRIPT_DIRECTIVES) {
				// A directive's value is `string[]`, or `true` for the valueless ones; only the list form
				// carries a source that could be unsafe.
				const sources = policy[directive as keyof typeof policy];
				for (const source of Array.isArray(sources) ? sources : []) {
					expect(
						`${where} ${directive} ${source}`,
						`${source} would let submitted markup run as script`
					).not.toMatch(/unsafe-(inline|eval)|wasm-unsafe-eval|^strict-dynamic$/);
				}
			}
		}
	});

	it('falls back to this origin for every directive it does not name', () => {
		expect(prod['default-src']).toEqual(['self']);
	});

	it('gives injected markup nowhere to send anything', () => {
		// connect-src is the quiet exfil route: a script that cannot run is one thing, a stylesheet or
		// fetch that can read a page and POST it elsewhere is another. Production is same-origin only —
		// which is all SvelteKit needs — and the only widening is dev's hot-reload socket.
		expect(prod['connect-src']).toEqual(['self']);
		expect(dev['connect-src']).toEqual(['self', 'ws:']);
		expect(prod['form-action']).toEqual(['self']);
	});

	it('refuses plugins, frames, and a swapped <base>', () => {
		expect(prod['object-src']).toEqual(['none']);
		expect(prod['frame-src']).toEqual(['none']);
		expect(prod['frame-ancestors']).toEqual(['none']);
		expect(prod['base-uri']).toEqual(['none']);
		// `<base href>` is how one injected tag rewrites every relative URL on the page; `form-action`
		// above is only meaningful while nothing can move the base the form's action resolves against.
	});

	it('is strict about styles only where Svelte leaves no choice', () => {
		// Component CSS is inlined into the page, and CSP nonces do not apply to inline styles — so this
		// is the one directive that is knowingly loose, in both modes, and it is why the rest can be not.
		expect(prod['style-src']).toEqual(['self', 'unsafe-inline']);
		expect(dev['style-src']).toEqual(['self', 'unsafe-inline']);
		// Declaring style-src (rather than leaning on default-src) is also what keeps Kit from having to
		// hash every inline <style> it emits, which would change on each build.
	});

	it('says what it means in both modes, and the only difference is the dev socket', () => {
		expect(Object.keys(prod).sort()).toEqual(Object.keys(dev).sort());
		for (const directive of Object.keys(prod)) {
			if (directive === 'connect-src') continue;
			expect(dev[directive as keyof typeof dev], directive).toEqual(
				prod[directive as keyof typeof prod]
			);
		}
	});
});

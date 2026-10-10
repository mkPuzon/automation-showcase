/**
 * The Content-Security-Policy this site ships with.
 *
 * Read by `vite.config.ts` and handed to SvelteKit's `csp` option, which applies it to every page and
 * adds a nonce to the inline scripts and styles Kit itself generates (Kit's `mode: 'auto'`). Nothing in
 * `src/` imports this file — it is build-time configuration that lives next to the app so `npm run
 * check` and the spec in `src/csp.spec.ts` both see it.
 *
 * Why this exists as a header rather than only as sanitization: the project pages and the admin
 * preview put a submitter's markup into the DOM. Two layers stand between that markup and a live
 * script — `api/app/rendering.py` (markdown-it with raw HTML off, then bleach) and
 * `src/lib/markdown.ts` (which refuses a fragment it does not recognise) — and both are code that
 * could one day have a hole. `script-src 'self'` + a nonce is the part of the response that does not
 * care: a script that arrives by way of a `.docx` has no nonce, so the browser will not run it, and —
 * because there is no `connect-src` escape hatch either — nothing injected can phone home or read the
 * `HttpOnly` admin cookie's origin with a `fetch`.
 *
 * The loosenings, each one deliberate:
 *
 * - `style-src 'unsafe-inline'` — Svelte inlines component CSS into the page, and CSP nonces do not
 *   apply to inline styles or `style=""` attributes (only hashes, and hashes break on every build
 *   change). Inline styles can restyle a page; they cannot execute anything.
 * - `img-src data:` — Vite inlines small assets (the favicon) as data URIs at build time.
 * - `connect-src ws:` in development only, for Vite's hot-reload socket. Production is `'self'`,
 *   which is all SvelteKit needs (it fetches its own data endpoints) and nothing else.
 */

import type { Config } from '@sveltejs/kit/vite';

/**
 * Kit's own directive type, reached through the `sveltekit()` options because Kit does not export the
 * type by name. Deriving it rather than writing `Record<string, string[]>` means a directive value Kit
 * would reject is a type error here, at build-config time, instead of a header nobody notices.
 */
type CspDirectives = NonNullable<NonNullable<Config['csp']>['directives']>;

/**
 * @param dev Vite's `command === 'serve'`. Dev gets the hot-reload socket and nothing else extra.
 */
export function cspDirectives({ dev = false }: { dev?: boolean } = {}): CspDirectives {
	return {
		'default-src': ['self'],
		// Kit appends `'nonce-…'` per response for the scripts it inlines; nothing else can execute.
		'script-src': ['self'],
		'style-src': ['self', 'unsafe-inline'],
		'img-src': ['self', 'data:'],
		'font-src': ['self'],
		'connect-src': dev ? ['self', 'ws:'] : ['self'],
		// No plugins, no frames, no `<base>` swap, and no site of ours inside someone else's frame.
		'object-src': ['none'],
		'frame-src': ['none'],
		'frame-ancestors': ['none'],
		'base-uri': ['none'],
		// Every form on the site posts to its own origin: /submit, /admin, and the four editor
		// actions. Allowing a remote form target would hand whoever set it a way to post the
		// reviewer's signed-in request body somewhere else.
		'form-action': ['self']
	};
}

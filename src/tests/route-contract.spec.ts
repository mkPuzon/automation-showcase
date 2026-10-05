/**
 * A shape check on the route modules, run outside the browser.
 *
 * This exists because of a real 500: `/admin` exported a `default` action *and* a named `out` action,
 * and Kit refuses that combination (`kit/action_default_with_named`) — it answers every sign-in POST
 * with an internal error before the password is compared. Nothing in the page, the guard, or the
 * session module was wrong, so no spec that unit-tests them could notice. The only thing that can
 * notice is something that looks at the exported shape, which is exactly what Kit checks.
 *
 * Deliberately narrow: it reads the files as text and checks the one rule Kit enforces at dispatch
 * time. It is not a parser, and it is not a substitute for the Playwright e2e (Phase 5).
 *
 * Run: npx vitest run src/tests/route-contract.spec.ts
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** Anchored to this file rather than to the cwd, so `vitest run <one file>` works from anywhere. */
const ROUTES = fileURLToPath(new URL('../routes/', import.meta.url));
const ADMIN_PAGE = fileURLToPath(new URL('../routes/admin/+page.svelte', import.meta.url));

/** Every `+page.server.ts` under src/routes, as { file, source }. */
function routeModules(dir = ROUTES): { file: string; source: string }[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) return routeModules(path);
		return entry === '+page.server.ts' ? [{ file: path, source: readFileSync(path, 'utf8') }] : [];
	});
}

/**
 * Comments out, so only real code is scanned.
 *
 * The one shortcut: `//` starts a line comment only when something whitespace-like precedes it, which
 * is what keeps `"https://…"` in a string from swallowing the rest of its line. Block comments go first,
 * so a `//` inside a doc comment cannot start a line comment of its own.
 */
function codeOnly(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
}

/**
 * The keys of `export const actions = { ... }`, or [] when the route has no actions.
 *
 * Braces are counted rather than matched by regex because every action body contains several. Only
 * identifiers at the outer level of the object literal count as keys, which is what makes
 * `redirect(303, ...)` inside a body safe to walk over.
 */
export function actionNames(source: string): string[] {
	const body = codeOnly(source);
	const declaration = body.indexOf('export const actions');
	if (declaration === -1) return [];
	const open = body.indexOf('{', declaration);
	if (open === -1) return [];

	const names: string[] = [];
	let depth = 0;
	for (let i = open; i < body.length; i += 1) {
		const char = body[i];
		if (char === '{') depth += 1;
		else if (char === '}') {
			depth -= 1;
			if (depth === 0) break;
		} else if (depth === 1 && /[A-Za-z_$]/.test(char)) {
			let end = i;
			while (end < body.length && /[\w$]/.test(body[end])) end += 1;
			const word = body.slice(i, end);
			// A key is an identifier whose next non-space character is a colon.
			if (/^\s*:/.test(body.slice(end))) names.push(word);
			i = end - 1;
		}
	}
	return [...new Set(names)];
}

/** The `?/name` targets the forms in a page or layout actually post to (`?/save`, `/x?/logout`). */
function namedTargets(source: string): string[] {
	return [...source.matchAll(/(?:form)?action\s*=\s*"[^"]*\?\/([A-Za-z_$][\w$]*)"/g)].map(
		(m) => m[1]
	);
}

const modules = routeModules();

describe('form actions', () => {
	it('finds the route modules and their actions (this is the scanner, so check the scanner)', () => {
		expect(modules.length).toBeGreaterThanOrEqual(5);

		const admin = modules.find((m) => m.file.includes('routes/admin/+page.server.ts'));
		expect(actionNames(admin?.source ?? '')).toEqual(['default']);

		const editor = modules.find((m) => m.file.includes('[id]'));
		expect(actionNames(editor?.source ?? '').sort()).toEqual([
			'delete',
			'preview',
			'save',
			'slug',
			'status'
		]);
	});

	it('reads keys, not braces from bodies and comments (the rule this file exists for)', () => {
		expect(
			actionNames(`
				/** a doc comment mentioning { braces } and // a slash comment */
				export const actions = {
					default: async ({ cookies }) => {
						if (cookies.get('x')) redirect(303, '/admin/dashboard');
						return fail<{ message: string }>(401, { message: 'nope' });
					},
					out: async () => {
						redirect(303, '/admin');
					}
				};`)
		).toEqual(['default', 'out']);
	});

	it('never mixes a default action with named ones on one route', () => {
		// Kit's rule, and the reason sign-in used to 500: `actions.default` plus any other key throws
		// at dispatch, so the whole page becomes unreachable rather than merely half-working.
		for (const { file, source } of modules) {
			const names = actionNames(source);
			const named = names.filter((name) => name !== 'default');
			expect(
				names.includes('default') && named.length > 0,
				`${file} exports default alongside ${named.join(', ')}`
			).toBe(false);
		}
	});

	it('posts the login form at the default action, since that page has only one', () => {
		const page = readFileSync(ADMIN_PAGE, 'utf8');
		expect(namedTargets(page)).toEqual([]);
		expect(/<form[^>]*method="post"/.test(page)).toBe(true);
	});

	it('points every named action a page posts at at something that exists', () => {
		let checked = 0;
		for (const { file, source } of modules) {
			const pageFile = file.replace('+page.server.ts', '+page.svelte');
			const layoutFile = file.replace('+page.server.ts', '+layout.svelte');
			const markup = [pageFile, layoutFile]
				.filter((path) => {
					try {
						return statSync(path).isFile();
					} catch {
						return false;
					}
				})
				.map((path) => readFileSync(path, 'utf8'))
				.join('\n');

			const available = actionNames(source);
			for (const target of namedTargets(markup)) {
				checked += 1;
				expect(available, `${file} has no ${target} action`).toContain(target);
			}
		}
		// The queue's `?/logout` lives in a layout, so something must have been found.
		expect(checked).toBeGreaterThan(0);
	});
});

/**
 * Cross-file UI contracts — things two or more files have to agree on, checked without a browser.
 *
 * Each test here compares one idea that exists in two places. All of them fail the way this project
 * actually fails: not with an error, but with a page that looks right. Add `'approved'` to the web's
 * union and Explore still renders; leave the migration's `CHECK` behind and the API starts 500ing on
 * the first write. Move the upload cap in `src/lib/validation.ts` and the browser cheerfully uploads
 * 40 MB to an API that then refuses it. Fix one of a pair and everything looks fine until someone
 * else hits the other half.
 *
 * The Playwright suite (`e2e/`) proves the happy path works end to end. This file proves the pairs
 * stayed together, which is cheaper and fails for the right reason.
 *
 * Run: npx vitest run src/tests/ui-contract.spec.ts
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MAX_UPLOAD_MB } from '#lib/validation';

const SRC = fileURLToPath(new URL('../', import.meta.url));
const API = fileURLToPath(new URL('../../api/', import.meta.url));
const COMPOSE = fileURLToPath(new URL('../../compose.yml', import.meta.url));

const read = (url: string): string => readFileSync(url, 'utf8');

/** Every `.svelte` file under src, as { file, source }. */
function svelteFiles(dir: string = SRC): { file: string; source: string }[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		if (entry === 'node_modules' || entry.startsWith('.')) return [];
		if (statSync(path).isDirectory()) return svelteFiles(path);
		return entry.endsWith('.svelte') ? [{ file: path, source: read(path) }] : [];
	});
}

/**
 * The contents of every quoted string in a file.
 *
 * How a vocabulary gets compared without a parser and without arguing about comments: a word in a
 * comment is documentation, a word in a string is a value. `'approved'` surviving here after the status
 * was retired means something still *uses* it, which is what a comment about retiring it cannot tell you.
 */
function stringLiterals(source: string): string[] {
	return [...source.matchAll(/(['"])((?:[^'"\\\n]|\\.)*)\1/g)].map((match) => match[2]);
}

/** The members of `export type Status = 'a' | 'b'`, in source order. */
function unionMembers(source: string, name: string): string[] {
	const declaration = new RegExp(`export type ${name}\\s*=([^;]*);`, 's').exec(source);
	if (!declaration) throw new Error(`no \`export type ${name}\` found`);
	return [...declaration[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

/** The members of `Status = Literal["a", "b"]` on the FastAPI side. */
function pythonLiteral(source: string, name: string): string[] {
	const declaration = new RegExp(`${name}\\s*=\\s*Literal\\[([^\\]]+)\\]`).exec(source);
	if (!declaration) throw new Error(`no \`${name} = Literal[...]\` found`);
	return [...declaration[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

const STATUSES = ['pending', 'published', 'rejected'];

const types = read(join(SRC, 'lib/types.ts'));
const migration = read(join(API, 'migrations/001_init.sql'));
const models = read(join(API, 'app/models.py'));
const editor = read(join(SRC, 'lib/components/AdminProjectEditor.svelte'));
const queue = read(join(SRC, 'lib/admin-queue.ts'));
const layout = read(join(SRC, 'routes/+layout.svelte'));
const validation = read(join(SRC, 'lib/validation.ts'));
const config = read(join(API, 'app/config.py'));
const submissions = read(join(API, 'app/routers/submissions.py'));

describe('the status vocabulary', () => {
	it('is the same three words in the web client, the schema, and the API', () => {
		// Four places spell this out, and only two of them fail loudly. The `CHECK` constraint and the
		// FastAPI `Literal` are enforced; the TypeScript union is not, so a drift there compiles, ships,
		// and then surfaces as the API returning a status the UI has no label or chip class for.
		expect(unionMembers(types, 'Status')).toEqual(STATUSES);
		expect(pythonLiteral(models, 'Status')).toEqual(STATUSES);
		// If this one fails, the schema no longer lists exactly the three live statuses.
		expect(migration).toMatch(/CHECK \(status IN \('pending', 'published', 'rejected'\)\)/);
	});

	it('has no trace of the retired fourth status in any value position', () => {
		// 'approved' was this project's fourth status until Phase 4 renamed it to 'published'. It may
		// still appear in prose explaining the retirement; it must not appear as something the code could
		// compare against, store, or render.
		for (const [where, source] of [
			['src/lib/types.ts', types],
			['src/lib/admin-queue.ts', queue],
			['api/app/models.py', models],
			['api/migrations/001_init.sql', migration]
		] as const) {
			const used = stringLiterals(source).filter((value) => /approv/i.test(value));
			expect(used, `${where} still carries ${JSON.stringify(used)}`).toEqual([]);
		}
	});

	it('reaches every status from the editor, with a sentence for what each one does', () => {
		// The reviewer's three buttons are the only way a project changes status. A status with no button
		// is a state you can enter and leave in the database but never from the UI.
		const offered = [...editor.matchAll(/status: '(\w+)'/g)].map((match) => match[1]);
		expect(offered.sort()).toEqual([...STATUSES].sort());
		expect(editor).toContain('Publish');
		expect(editor).toContain('Not on Explore.');
	});

	it('adds exactly `all` to the queue filter, on both sides', () => {
		// The web's filter type is built *from* `Status`, so it cannot drift from it; FastAPI has no way to
		// compose, so it spells all four out and has to be compared against the list.
		expect(unionMembers(types, 'StatusFilter')).toEqual(['all']);
		expect(/export type StatusFilter\s*=\s*Status\s*\|/.test(types)).toBe(true);
		expect(pythonLiteral(models, 'StatusFilter')).toEqual([...STATUSES, 'all']);
		// The client-side parser's own list, which is what decides whether a hand-typed ?status= is honoured.
		const filters = /FILTERS: StatusFilter\[\] = \[([^\]]+)\]/.exec(queue)?.[1] ?? '';
		expect(filters).not.toBe('');
		expect([...filters.matchAll(/'([^']+)'/g)].map((match) => match[1])).toEqual([
			...STATUSES,
			'all'
		]);
	});
});

describe('the one place markup is injected', () => {
	it('injects markup in ProjectBody and nowhere else', () => {
		// `src/lib/markdown.ts` refuses a fragment it does not recognise, and CSP is the outer wall. Both
		// of those only protect submitted markup while submitted markup arrives through one component.
		// A second `{@html}` is a second sanitizer to remember, and it is always forgotten.
		const injectors = svelteFiles()
			.filter(({ source }) => source.includes('{@html'))
			.map(({ file }) => file.replace(SRC, 'src/'));
		expect(injectors).toEqual(['src/lib/components/ProjectBody.svelte']);
	});

	it('leaves the app shell with nothing inline for a nonce to have to cover', () => {
		// Kit nonces the scripts it generates. A hand-written inline `<script>` in the shell is the one
		// thing that would push this project toward `'unsafe-inline' in script-src`, which would undo
		// src/csp.ts for every page on the site.
		expect(read(join(SRC, 'app.html'))).not.toMatch(/<script/i);
	});

	it('attaches no string-valued event handlers in any template', () => {
		// `onclick={go}` is fine — Svelte compiles that to addEventListener. `onclick="…"` is a string the
		// browser compiles, which is exactly what `script-src` blocks, and it is the same syntax submitted
		// markup would have to use. Catching it here keeps a CSP failure from first appearing in a browser.
		for (const { file, source } of svelteFiles()) {
			expect(source, `${file} has an inline string handler`).not.toMatch(
				/\son[a-z]+=(?:"[^"]*"|'[^']*')/
			);
		}
	});

	it('never writes a javascript: or data: href by hand', () => {
		for (const { file, source } of svelteFiles()) {
			expect(source, `${file} links through a URL scheme`).not.toMatch(
				/href=["'](javascript|data):/i
			);
		}
	});
});

describe('the nav a visitor sees', () => {
	const nav = /<nav class="nav"[\s\S]*?<\/nav>/.exec(layout)?.[0] ?? '';

	it('offers Explore and Submit, and does not advertise the admin area', () => {
		expect(nav, 'the main nav is no longer the block this test reads').not.toBe('');
		expect([...nav.matchAll(/href="([^"]+)"/g)].map((match) => match[1])).toEqual(['/', '/submit']);
		// Locked decision: /admin is not linked from the public nav. `noindex` and robots.txt keep it out
		// of search results; not linking it keeps a visitor from mistaking it for a login they should have.
		expect(layout).not.toMatch(/href="\/admin/);
	});

	it('links every nav target to a route that exists', () => {
		for (const href of ['/', '/submit']) {
			const route =
				href === '/' ? join(SRC, 'routes/+page.svelte') : join(SRC, 'routes', href, '+page.svelte');
			expect(statSync(route).isFile(), `no page behind ${href}`).toBe(true);
		}
	});

	it('tells crawlers to stay out of /admin, which is where the email addresses are', () => {
		const robots = read(fileURLToPath(new URL('../../static/robots.txt', import.meta.url)));
		expect(robots).toMatch(/Disallow: \/admin/);
		expect(robots).toMatch(/Allow: \//);
	});
});

describe('the 10 MB upload limit', () => {
	it('is the same number on both sides of the wire', () => {
		// The browser checks it so a bad file never crosses the network; the API checks it because the
		// browser's answer is not evidence. Two numbers, and only one of them is enforced.
		expect(MAX_UPLOAD_MB).toBe(10);
		expect(config).toMatch(/max_upload_mb: int = 10/);
		// And the web's copy is the one the form's message is built from, so drift would have the form
		// refuse a file the API would have taken.
		expect(validation).toContain('MAX_UPLOAD_MB = 10');
	});

	it('leaves the Node server room for the body around the file', () => {
		// adapter-node refuses a request body over BODY_SIZE_LIMIT with a bare 413, before
		// src/hooks.server.ts runs and before the API ever sees the file. Set it below the upload limit
		// and a 10 MB write-up is refused with a status page instead of the form's own sentence — the
		// multipart envelope plus the other fields means it needs to sit *above* 10 MiB, not at it.
		const limit = /\$\{WEB_BODY_SIZE_LIMIT:-(\d+)M\}/.exec(read(COMPOSE));
		expect(limit, 'compose.yml no longer sets a BODY_SIZE_LIMIT default').not.toBeNull();
		const megabytes = Number(limit?.[1]);
		expect(megabytes).toBeGreaterThanOrEqual(Number((MAX_UPLOAD_MB * 1.048576 + 1).toFixed(2)));
	});

	it('still calls the honeypot the same thing on both sides', () => {
		// The field is named after a bot's habit rather than a real question. The web layer sends it empty;
		// the API reads it by name. Rename one and the other silently stops being checked, in the
		// direction where "not checked" looks like success.
		const web = /export const HONEYPOT_FIELD = '(\w+)'/.exec(validation)?.[1];
		const api = /HONEYPOT_FIELD = "(\w+)"/.exec(submissions)?.[1];
		expect(web).toBeTruthy();
		expect(api).toBe(web);
	});
});

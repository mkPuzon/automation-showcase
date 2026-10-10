/**
 * The one path this site exists for, end to end, in a real browser against a real API and database.
 *
 * A staff member attaches a `.docx` on `/submit`; a reviewer reads it in `/admin`, publishes it, and a
 * reader finds it on Explore. Every step here is a request to a server that is actually running — no
 * stubbed fetch, no seeded row dropped straight into the queue. That is what makes this worth the
 * seconds it costs: both sides of the `.docx` boundary have been tested alone (`api/tests/`,
 * `src/lib/`), and this is the only test that knows whether they still fit together.
 *
 * The second test is the one to keep. It puts hostile markup into a body *through the admin editor* —
 * the widest door in the product, since a reviewer can paste anything into the Markdown box — and then
 * asks a browser what came out. Three layers are supposed to answer for that: markdown-it with raw
 * HTML off, bleach in `api/app/rendering.py`, and the CSP from `src/csp.ts`. Any one of them can have
 * a hole; what the test insists on is that a script in a body still does not run.
 *
 * Run: npx playwright test e2e/publishing.e2e.ts
 */

import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { MIN_RENDER_AGE_MS } from '../src/lib/antibot.ts';
import { signIn } from './session.ts';

declare global {
	interface Window {
		/** Set by anything that got through. Every assertion below says it stays undefined. */
		__techshare_e2e_pwned__?: number;
		/** Set when the browser reports it blocked an inline script. */
		__techshare_e2e_blocked__: boolean;
	}
}

/** The fixture the API's own parser tests use, so both suites parse the same bytes. */
const WRITEUP = fileURLToPath(new URL('../api/tests/fixtures/writeup.docx', import.meta.url));

/** Unique per run: the slug is derived from the title, and the schema says a slug is unique. */
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const TITLE = `Renaming 900 scanned syllabi with a two-line shell loop ${RUN}`;

/** Shared between the tests on purpose — they are one project's life, in order (see playwright.config). */
let projectId = '';
let slug = '';

const pwned = () => (window as Window).__techshare_e2e_pwned__;

test.describe('a write-up from submission to Explore', () => {
	test('a submitted .docx is pending, and only an admin can make it public', async ({ page }) => {
		// --- submit ---------------------------------------------------------------------------------
		await page.goto('/submit');
		await page.getByLabel('First name').fill('Robin');
		await page.getByLabel('Last name').fill('Okafor');
		await page.getByLabel('Colby email').fill('techshare-e2e@colby.edu');
		await page.getByLabel('Department or unit').fill('Digital Learning Initiative');
		await page.getByLabel('Title of the write-up').fill(TITLE);
		await page.getByLabel('Technologies').fill('zsh, Python');
		await page.setInputFiles('input[name="document"]', WRITEUP);

		// The form refuses a submit that arrives sooner than MIN_RENDER_AGE_MS after it rendered — the
		// speed bump in `src/lib/antibot.ts`. Read straight from that file so the two cannot drift: when
		// somebody raises the delay, this test waits for the new number instead of failing on it. A person
		// typing this form takes far longer than the floor; only a bot would notice.
		await page.waitForTimeout(MIN_RENDER_AGE_MS + 500);
		await page.getByRole('button', { name: 'Submit for review' }).click();

		await expect(
			page.getByRole('heading', { name: 'Your write-up is in. Thank you.' })
		).toBeVisible();
		await expect(page.getByText('Pending review')).toBeVisible();

		// The receipt quotes the address but must not link it: a pending write-up is not public, and a
		// link the submitter forwards to a colleague would 404 on them.
		await expect(page.locator('a[href^="/projects/"]')).toHaveCount(0);

		// --- not on Explore yet ---------------------------------------------------------------------
		await page.goto('/');
		await expect(page.getByRole('link', { name: TITLE })).toHaveCount(0);

		// --- the queue ------------------------------------------------------------------------------
		await signIn(page);
		const row = page.getByRole('link', { name: TITLE });
		await expect(row).toBeVisible();
		await row.click();
		await expect(page).toHaveURL(/\/admin\/dashboard\/\d+/);
		projectId = new URL(page.url()).pathname.split('/').pop()!;

		// The reviewer reads the parsed Markdown and can see which file it came from. This is the .docx
		// → Markdown conversion being checked through a browser rather than a unit test: headings, table
		// and all, in the box the admin will fix typos in.
		await expect(page.locator('textarea[name="body_markdown"]')).toHaveValue(/## What you need/);
		await expect(page.locator('textarea[name="body_markdown"]')).toHaveValue(/clean_sensors\.py/);
		await expect(page.getByText('writeup.docx', { exact: true })).toBeVisible();

		// --- publish --------------------------------------------------------------------------------
		await page.getByRole('button', { name: 'Publish' }).click();
		await expect(page.getByText('Published — it is on Explore now.')).toBeVisible();

		// --- on Explore, and readable ---------------------------------------------------------------
		await page.goto('/');
		await expect(page.getByRole('link', { name: TITLE })).toBeVisible();

		await page.getByRole('link', { name: TITLE }).click();
		await expect(page).toHaveURL(/\/projects\/[a-z0-9-]+/);
		slug = new URL(page.url()).pathname.split('/').pop()!;

		await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'What you need' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Gotchas' })).toBeVisible();
		// Parsed from the .docx, not scraped as plain text: bold stayed bold, h3 stayed a heading.
		await expect(page.getByText('sensor share', { exact: true })).toBeVisible();
		await expect(page.getByText('Robin Okafor', { exact: true })).toBeVisible();
		await expect(page.getByText('Digital Learning Initiative', { exact: true })).toBeVisible();
		await expect(page.getByText('Original document: writeup.docx.')).toBeVisible();
	});

	test('hostile markup in a body stays inert on the public page', async ({ page }) => {
		test.skip(projectId === '', 'needs the project the first test filed');

		const payload = [
			'## Still fine',
			'',
			'These lines are the test, added by the reviewer after reading the write-up.',
			'',
			'<script>window.__techshare_e2e_pwned__ = 1</script>',
			'<img src="https://e2e.invalid/pixel.png" onerror="window.__techshare_e2e_pwned__ = 2">',
			'<p onclick="window.__techshare_e2e_pwned__ = 3">a paragraph with a handler</p>',
			'',
			'[a link that is not a link](javascript:window.__techshare_e2e_pwned__=4)',
			''
		].join('\n');

		await signIn(page);
		await page.goto(`/admin/dashboard/${projectId}`);
		await page.locator('textarea[name="body_markdown"]').fill(payload);
		await page.getByRole('button', { name: 'Save changes' }).click();
		await expect(page.getByText('Saved.')).toBeVisible();

		await page.goto(`/projects/${slug}`);
		// Reader-visible truth: the words are all still there, as text. Nothing is silently deleted, so a
		// reviewer can see what the submitter wrote and fix it rather than guess.
		await expect(page.getByRole('heading', { name: 'Still fine' })).toBeVisible();
		await expect(page.getByText(/a link that is not a link/)).toBeVisible();

		// Mechanism truth: nothing live survived the trip through the API, so there is nothing for the
		// browser's sanitizer to catch up on.
		expect(await page.content()).not.toContain('<script>window.__techshare_e2e_pwned__');
		await expect(page.locator('article img')).toHaveCount(0);
		await expect(page.locator('[onclick]')).toHaveCount(0);
		await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
		expect(await page.evaluate(pwned)).toBeUndefined();

		// Now arm it for real. This is the claim `src/csp.ts` exists to make, and it is checkable without
		// the API's cooperation at all: a script that arrives at the DOM by any route has no nonce.
		await page.evaluate(() => {
			window.__techshare_e2e_blocked__ = false;
			document.addEventListener('securitypolicyviolation', (event) => {
				if ((event as SecurityPolicyViolationEvent).blockedURI === 'inline') {
					window.__techshare_e2e_blocked__ = true;
				}
			});
			const script = document.createElement('script');
			script.textContent = 'window.__techshare_e2e_pwned__ = 9';
			document.body.append(script);
		});
		await expect.poll(() => page.evaluate(() => window.__techshare_e2e_blocked__)).toBe(true);
		expect(await page.evaluate(pwned)).toBeUndefined();
	});

	test('deleting it takes it off Explore and out of the queue', async ({ page }) => {
		test.skip(projectId === '', 'needs the project the first test filed');

		await signIn(page);
		await page.goto(`/admin/dashboard/${projectId}`);
		// Delete lives behind one honest click, not a full-width section.
		await page.locator('.admin-delete summary').click();
		await page.locator('input[name="confirm"]').check();
		await page.getByRole('button', { name: 'Delete this write-up' }).click();
		await expect(page.locator('.notice').filter({ hasText: TITLE })).toBeVisible();

		await page.goto('/');
		await expect(page.getByRole('link', { name: TITLE })).toHaveCount(0);

		await page.goto('/admin/dashboard?status=all');
		await expect(page.getByRole('link', { name: TITLE })).toHaveCount(0);

		// The address is gone rather than left serving a stale body: 404 is the honest answer to a slug
		// somebody may have bookmarked while it was live.
		const response = await page.request.get(`/projects/${slug}`);
		expect(response.status()).toBe(404);
	});
});

/**
 * What `/projects/<slug>` decides, tested without a browser.
 *
 * The page itself is a template; the decisions are all in its `load`, and each one is a sentence a
 * reader will repeat to somebody else:
 *
 * - A slug that exists but is not published must read as "not published yet", not as a broken link.
 *   This is the most common support question the site will generate — someone submits a write-up, is
 *   handed a slug by the receipt, and pastes it to a colleague while it is still in the queue.
 * - The API being down is a 503 with a "reload in a moment", never a 404 that tells the reader the
 *   write-up was deleted, and never a blank grid pretending the shelf is empty.
 * - A bug stays a bug. Laundering every throw into a 503 "service not responding" is how a typo in
 *   this file ends up blamed on the api container for an afternoon.
 *
 * The rendering of the body itself — including the case where the markup is refused and the Markdown
 * source is shown instead — is `src/lib/components/ProjectBody.svelte.spec.ts`. The real end-to-end
 * trip through the API is `e2e/publishing.e2e.ts`.
 *
 * Run: npx vitest run src/routes/proj-page.spec.ts
 */

import { isHttpError, type HttpError } from '@sveltejs/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_DOWN_MESSAGE } from '#lib/api';
import { detail } from '../tests/fixtures';
import { load } from './projects/[slug]/+page.server';

const slug = detail.slug;

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

/** Run the page's load for one slug, the way Kit would (only `params` is read). */
function open(which = slug): ReturnType<typeof load> {
	return load({ params: { slug: which } } as Parameters<typeof load>[0]);
}

/** The `error(...)` a load raised, rather than an exception from the test itself. */
async function raised(run: () => Promise<unknown>): Promise<HttpError> {
	try {
		await run();
	} catch (cause) {
		if (!isHttpError(cause)) {
			throw new Error(`expected an HttpError, got ${String(cause)}`, { cause });
		}
		return cause;
	}
	throw new Error('expected the load to raise an error status');
}

afterEach(() => vi.unstubAllGlobals());

describe('/projects/[slug] load', () => {
	it('hands a published project to the page', async () => {
		const asked: string[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: string) => {
				asked.push(new URL(String(input)).pathname);
				return json(detail);
			})
		);

		await expect(open()).resolves.toMatchObject({ project: { slug, title: detail.title } });
		// By slug over the public route — `/api/projects/{slug}` is the endpoint that only serves
		// published rows. The admin endpoint would leak a pending write-up into a public page.
		expect(asked).toEqual([`/api/projects/${slug}`]);
	});

	it('escapes a slug containing something that is not a slug', async () => {
		const asked: string[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: string) => {
				asked.push(String(input));
				return json(detail);
			})
		);

		await open('../elsewhere');
		expect(asked[0]).toContain('/api/projects/..%2Felsewhere');
	});

	it('calls an unpublished slug missing rather than broken', async () => {
		// The API 404s for pending and rejected rows on the public route, and `getProject` passes that
		// through as null; this is where it becomes a sentence about review.
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => json({ detail: 'Not found.' }, 404))
		);

		const failure = await raised(open);
		expect(failure.status).toBe(404);
		expect(failure.body.message).toContain('No published project lives at that address');
		expect(failure.body.message).toContain('awaiting review');
	});

	it('says "reload in a moment" when the api is not answering at all', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError('fetch failed');
			})
		);

		const failure = await raised(open);
		expect(failure.status).toBe(503);
		expect(failure.body.message).toContain(API_DOWN_MESSAGE);
	});

	it('does not turn a live-but-failing api into a missing project', async () => {
		// 404 means "no such write-up"; 500 means "we both know it is there". Only the first one is
		// allowed to become a 404 page, because a reader who is told "not found" stops reloading.
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => json({ detail: 'Internal Server Error' }, 500))
		);

		const failure = await raised(open);
		expect(failure.status).toBe(503);
		expect(failure.body.message).toContain('answered 500');
	});

	it('lets a bug through as itself', async () => {
		// A lone surrogate cannot be percent-encoded, so this throws from inside src/lib/api.ts before a
		// request is ever made: a fault of ours rather than the api's. It has to surface as a 500 with a
		// stack in the server log, not as the "service not responding" page that sends whoever is on call
		// to restart a container that is fine. `encodeURIComponent` is the only thing between us and that.
		const fetch = vi.fn(async () => json(detail));
		vi.stubGlobal('fetch', fetch);

		await expect(open('\ud800')).rejects.toBeInstanceOf(URIError);
		expect(fetch).not.toHaveBeenCalled();
	});
});

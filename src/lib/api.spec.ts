/**
 * What the web layer says when FastAPI answers badly.
 *
 * The case these tests exist for is a 404: our own routes are unconditional, so a 404 means the thing
 * on the other end of `API_URL` is not this API (another project's container on `:8000` is the usual
 * one) or the api process predates the route. That must be said out loud, and must not be dressed up
 * as either "nothing is published yet" or "your submission was rejected".
 *
 * Run: npx vitest run src/lib/api.spec.ts
 */

import { API_URL } from '$app/env/private';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	ApiError,
	describeApiTarget,
	getProject,
	listProjects,
	missingApiRoutes,
	submitProject
} from '#lib/api';
import { submissionValues } from '../tests/fixtures';

function respond(status: number, body?: unknown): Response {
	return new Response(body === undefined ? '' : JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

/** The 10 MB `.docx` stand-in the client only ever forwards. */
function docx(): File {
	return new File(['x'], 'write-up.docx', {
		type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
	});
}

async function failure(run: () => Promise<unknown>): Promise<ApiError> {
	try {
		await run();
	} catch (cause) {
		expect(cause).toBeInstanceOf(ApiError);
		return cause as ApiError;
	}
	throw new Error('expected the call to throw');
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('listProjects', () => {
	it('returns the published projects', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => respond(200, [{ id: 1 }]))
		);
		await expect(listProjects()).resolves.toEqual([{ id: 1 }]);
	});

	it('treats a 404 on the collection as a fault, not an empty shelf', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => respond(404, { detail: 'Nothing was found there.' }))
		);
		const error = await failure(listProjects);
		expect(error.problem).toBe('bad-response');
		expect(error.status).toBe(404);
		// The whole diagnosis: which path, which base URL.
		expect(error.message).toContain('/api/projects');
		expect(error.message).toContain(API_URL);
	});

	it('says the service is down when nothing answers', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError('fetch failed');
			})
		);
		const error = await failure(listProjects);
		expect(error.problem).toBe('unreachable');
	});
});

describe('getProject', () => {
	it('lets a missing slug through as null for the 404 page', async () => {
		let askedFor = '';
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: string) => {
				askedFor = input;
				return respond(404, { detail: 'project not found' });
			})
		);
		await expect(getProject('no-such-project')).resolves.toBeNull();
		expect(askedFor).toBe(`${API_URL}/api/projects/no-such-project`);
	});
});

describe('describeApiTarget', () => {
	const HEALTH = { status: 'ok', database: 'up', version: '0.1.0' };
	/** The routes a current `api` process publishes. */
	const CURRENT = [
		'/api/projects',
		'/api/projects/{slug}',
		'/api/submissions',
		'/api/health',
		'/api/admin/projects',
		'/api/admin/projects/{project_id}',
		'/api/admin/projects/{project_id}/status',
		'/api/admin/preview'
	];
	const openapi = (paths: string[]) => ({
		openapi: '3.1.0',
		info: { version: '0.1.0' },
		paths: Object.fromEntries(paths.map((path) => [path, {}]))
	});

	/** Answer per pathname, the way a real process does — the probe asks two questions. */
	function stubEndpoints(routes: Record<string, Response>): void {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: string) => {
				const path = new URL(String(input)).pathname;
				return routes[path] ?? respond(404, { detail: 'Nothing was found there.' });
			})
		);
	}

	it('names the API when a current one answers', async () => {
		stubEndpoints({
			'/api/health': respond(200, HEALTH),
			'/openapi.json': respond(200, openapi(CURRENT))
		});
		const line = await describeApiTarget();
		expect(line).toContain('techshare-api 0.1.0');
		expect(line).not.toContain('does not serve');
	});

	it('says so when the api process predates the routes', async () => {
		// Exactly an `uvicorn` started before Phase 3 and 4: healthy, and 404 on everything newer.
		stubEndpoints({
			'/api/health': respond(200, HEALTH),
			'/openapi.json': respond(
				200,
				openapi(['/api/projects', '/api/projects/{slug}', '/api/health'])
			)
		});
		const line = await describeApiTarget();
		expect(line).toContain('does not serve /api/submissions');
		expect(line).toContain('/api/admin/projects');
	});

	it('says so when a different service holds the port', async () => {
		// The real answer from another project's container on :8000: a 404 with its own error shape.
		stubEndpoints({});
		const line = await describeApiTarget();
		expect(line).toContain('not this API');
		expect(line).toContain(API_URL);
	});

	it('does not throw when nothing is listening', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError('fetch failed');
			})
		);
		expect(await describeApiTarget()).toContain('is the api running');
	});

	it('asks again while the api is still booting, and says when it arrives', async () => {
		// The compose startup race: the api binds :8000 a few seconds after its container starts.
		let healthCalls = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: string) => {
				const path = new URL(String(input)).pathname;
				if (path === '/api/health' && ++healthCalls < 3) throw new TypeError('fetch failed');
				return path === '/api/health' ? respond(200, HEALTH) : respond(200, openapi(CURRENT));
			})
		);

		const line = await describeApiTarget({ retries: 4, delayMs: 1 });
		expect(healthCalls).toBe(3);
		expect(line).toContain('techshare-api 0.1.0');
		expect(line).toContain('came up after 2 retries');
	});

	it('says how long it kept looking when the api never came up', async () => {
		const probe = vi.fn(async () => {
			throw new TypeError('fetch failed');
		});
		vi.stubGlobal('fetch', probe);

		const line = await describeApiTarget({ retries: 2, delayMs: 500 });
		expect(probe).toHaveBeenCalledTimes(3); // the first look plus two retries
		expect(line).toContain('is the api running');
		expect(line).toContain('Kept looking for 1s');
	});

	it('lists the routes a live process is missing', () => {
		expect(missingApiRoutes(openapi(CURRENT))).toEqual([]);
		expect(missingApiRoutes(openapi(['/api/projects', '/api/health']))).toEqual([
			'/api/submissions',
			'/api/admin/projects'
		]);
		// Not OpenAPI at all: say every route is missing rather than pretend it is fine.
		expect(missingApiRoutes({ error: 'E_NOT_FOUND' })).toEqual([
			'/api/projects',
			'/api/submissions',
			'/api/admin/projects'
		]);
	});
});

describe('submitProject', () => {
	it('files the write-up and hands back the API answer', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => respond(201, { id: 7, slug: 'a-slug', status: 'pending' }))
		);
		await expect(submitProject(submissionValues, docx())).resolves.toMatchObject({ id: 7 });
	});

	it('quotes FastAPI when it refuses the write-up', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => respond(422, { detail: 'The write-up has to be a .docx file.' }))
		);
		const error = await failure(() => submitProject(submissionValues, docx()));
		expect(error.message).toBe('The write-up has to be a .docx file.');
		expect(error.status).toBe(422);
	});

	it('names the endpoint and the base URL when the route itself is missing', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => respond(404))
		);
		const error = await failure(() => submitProject(submissionValues, docx()));
		expect(error.problem).toBe('bad-response');
		// Not "The submission was rejected (404)." — nothing was rejected, and nothing was aimed at us.
		expect(error.message).not.toMatch(/rejected/i);
		expect(error.message).toContain('/api/submissions');
		expect(error.message).toContain(API_URL);
	});

	it('keeps a 5xx explanation ours', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => respond(503, { detail: 'database unavailable' }))
		);
		const error = await failure(() => submitProject(submissionValues, docx()));
		expect(error.message).toMatch(/nothing was submitted/i);
		expect(error.status).toBe(503);
	});
});

/**
 * Thin FastAPI client. Server-side only — import it from `+page.server.ts` / form actions,
 * never from a component (it reads a server-only env module, and the browser must not reach
 * FastAPI directly).
 *
 * `GET /api/projects`  -> listProjects()   (published, metadata only)
 * `GET /api/projects/{slug}` -> getProject()  (one project + rendered body HTML)
 */

import { API_URL } from '$app/env/private';
import type { ProjectDetail, ProjectSummary } from '#lib/types';

const TIMEOUT_MS = 8000;

export type ApiProblem =
	| 'unreachable' // connection refused / timeout / DNS — api process is down
	| 'bad-response'; // up, but answered 5xx / sent something that isn't our JSON

export class ApiError extends Error {
	readonly problem: ApiProblem;
	readonly status?: number;

	constructor(problem: ApiProblem, message: string, status?: number) {
		super(message);
		this.name = 'ApiError';
		this.problem = problem;
		this.status = status;
	}
}

/** What we show a reader when the API is not answering (Phase 5 fleshes this out). */
export const API_DOWN_MESSAGE =
	'The project service is not responding. Reload in a moment — if it keeps happening, tell Computing Services.';

function baseUrl(): string {
	return API_URL;
}

/** Returns parsed JSON, or `null` for a 404 so callers can raise their own 404 page. */
async function getJson<T>(path: string): Promise<T | null> {
	const url = `${baseUrl()}${path}`;
	let response: Response;
	try {
		response = await fetch(url, {
			headers: { accept: 'application/json' },
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
	} catch (cause) {
		const reason = cause instanceof Error ? cause.message : 'fetch failed';
		throw new ApiError('unreachable', `${API_DOWN_MESSAGE} (${reason})`);
	}

	if (response.status === 404) return null;

	if (!response.ok) {
		throw new ApiError(
			'bad-response',
			`The project service answered ${response.status}.`,
			response.status
		);
	}

	try {
		return (await response.json()) as T;
	} catch {
		throw new ApiError('bad-response', 'The project service returned malformed JSON.');
	}
}

export async function listProjects(): Promise<ProjectSummary[]> {
	return (await getJson<ProjectSummary[]>('/api/projects')) ?? [];
}

export async function getProject(slug: string): Promise<ProjectDetail | null> {
	return await getJson<ProjectDetail>(`/api/projects/${encodeURIComponent(slug)}`);
}

/**
 * Thin FastAPI client. Server-side only — import it from `+page.server.ts` / form actions,
 * never from a component (it reads a server-only env module, and the browser must not reach
 * FastAPI directly).
 *
 * `GET /api/projects`  -> listProjects()   (published, metadata only)
 * `GET /api/projects/{slug}` -> getProject()  (one project + rendered body HTML)
 * `POST /api/submissions` -> submitProject()  (multipart: metadata + the .docx)
 * `/api/admin/*` -> admin*()  (each takes the session token from the signed cookie)
 */

import { API_URL } from '$app/env/private';
import { HONEYPOT_FIELD, type SubmissionValues } from '#lib/validation';
import type {
	AdminProjectDetail,
	AdminProjectEdit,
	AdminProjectSummary,
	StatusFilter,
	Status,
	ProjectDetail,
	ProjectSummary,
	SubmissionResult
} from '#lib/types';

const TIMEOUT_MS = 8000;
// Parsing a 10 MB .docx is CPU work in the API, so the write path gets more room than a read.
const SUBMIT_TIMEOUT_MS = 30000;
// The startup probe must never hold up the first request for longer than this.
const STARTUP_TIMEOUT_MS = 2000;

export type ApiProblem =
	| 'unreachable' // connection refused / timeout / DNS — api process is down
	| 'bad-response' // up, but answered 5xx / sent something that isn't our JSON
	| 'unauthorized'; // the admin session cookie is missing, expired, or signed with an old key

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

/**
 * The sentence for a 404 on a route we know exists: `/api/projects`, `/api/submissions`, `/api/admin/*`
 * are not conditional, so a 404 means the thing that answered is not this API. In practice that is an
 * `API_URL` aimed at another project's container on a busy port (`:8000` and `:5173` are the usual
 * ones), or an api process started before the route was written. Naming the base URL is the whole
 * diagnosis, and it is the one thing every other message here was missing.
 */
function unroutedMessage(path: string, detail: string | null): string {
	return (
		`${detail ?? 'The project service answered 404.'} ` +
		`(nothing at ${baseUrl()} answered ${path} — check API_URL, and restart any api process ` +
		'started before this route existed; run it with --reload in development)'
	);
}

type GetOptions = {
	/** A 404 is a real answer rather than a fault: the caller raises its own 404 page. */
	allowMissing?: boolean;
};

/** Returns parsed JSON, or `null` for a 404 the caller asked to be allowed to handle. */
async function getJson<T>(
	path: string,
	{ allowMissing = false }: GetOptions = {}
): Promise<T | null> {
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

	if (response.status === 404) {
		if (allowMissing) return null;
		// A 404 from the collection route is not an empty shelf: it is the wrong service on the port,
		// and rendering "nothing is published yet" over that costs a day of puzzlement.
		const detail = await readDetail(response);
		throw new ApiError('bad-response', unroutedMessage(path, detail), 404);
	}

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

/** `allowMissing`: one missing slug is a 404 page for a reader, not a broken deployment. */
export async function getProject(slug: string): Promise<ProjectDetail | null> {
	return await getJson<ProjectDetail>(`/api/projects/${encodeURIComponent(slug)}`, {
		allowMissing: true
	});
}

/** The multipart body FastAPI expects. `document` is the only part the API cannot do without. */
export function submissionPayload(values: SubmissionValues, document: File): FormData {
	const form = new FormData();
	form.set('first_name', values.first_name);
	form.set('last_name', values.last_name);
	form.set('email', values.email);
	form.set('department', values.department);
	form.set('title', values.title);
	for (const technology of values.technologies) form.append('technologies', technology);
	for (const contributor of values.contributors) form.append('contributors', contributor);
	// The API runs the same honeypot check we do; an empty value is the honest answer.
	form.set(HONEYPOT_FIELD, '');
	form.set('document', document, document.name);
	return form;
}

/** FastAPI's 4xx `detail` is a sentence written for whoever is submitting, so we read it out. */
async function readDetail(response: Response): Promise<string | null> {
	try {
		const body: unknown = await response.json();
		if (typeof body === 'string') return body.trim() || null;
		if (
			body &&
			typeof body === 'object' &&
			typeof (body as { detail?: unknown }).detail === 'string'
		) {
			return ((body as { detail: string }).detail || '').trim() || null;
		}
	} catch {
		/* not JSON — the caller falls back to a generic sentence */
	}
	return null;
}

/**
 * File a write-up as a `pending` project.
 *
 * Throws `ApiError`. For a rejection (4xx) the message is FastAPI's own, because that is the one
 * that knows why; for anything 5xx it is ours, because the API's reason is not for the submitter.
 */
export async function submitProject(
	values: SubmissionValues,
	document: File
): Promise<SubmissionResult> {
	let response: Response;
	try {
		// No `content-type` header: fetch has to set the multipart boundary itself.
		response = await fetch(`${baseUrl()}/api/submissions`, {
			method: 'POST',
			body: submissionPayload(values, document),
			signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS)
		});
	} catch (cause) {
		const reason = cause instanceof Error ? cause.message : 'fetch failed';
		throw new ApiError('unreachable', `${API_DOWN_MESSAGE} (${reason})`);
	}

	if (response.ok) {
		try {
			return (await response.json()) as SubmissionResult;
		} catch {
			throw new ApiError(
				'bad-response',
				'The project service accepted the write-up but did not confirm it. Check Explore before submitting again.'
			);
		}
	}

	const detail = await readDetail(response);
	if (response.status === 404 || response.status === 405) {
		// `POST /api/submissions` always exists in this codebase, so this answer did not come from it:
		// the submitter's "rejected" is really a misconfigured or out-of-date api process, and saying so
		// beats making someone re-read their own .docx.
		throw new ApiError(
			'bad-response',
			unroutedMessage('/api/submissions', detail),
			response.status
		);
	}
	if (response.status >= 500) {
		throw new ApiError(
			'bad-response',
			'The project service could not take the write-up just now, and nothing was submitted. Try again in a moment.',
			response.status
		);
	}
	throw new ApiError(
		'bad-response',
		detail ?? `The submission was rejected (${response.status}).`,
		response.status
	);
}

/**
 * One line for the web log naming the API this process will talk to.
 *
 * Called once at startup by `src/hooks.server.ts`. It exists because of the failures this project keeps
 * having on a shared machine, both of which leave every page rendering and only the writes mysterious:
 *
 * - `API_URL` points at another project's container on a busy port, so the writes 404.
 * - the api process predates the routes (`uvicorn` without `--reload`, started before Phase 4), so it
 *   answers `/api/health` perfectly and 404s on everything newer.
 *
 * Saying which of those it is — or that nothing answered at all — states the misconfiguration before
 * anyone has to submit anything to find it.
 *
 * Never throws: an unreachable API is a sentence in the log, not a web container that will not boot.
 */
export async function describeApiTarget({
	retries = 0,
	delayMs = 2000
}: ApiProbeOptions = {}): Promise<string> {
	const first = await probeApiTargetOnce();
	// Only silence is worth repeating. "Something answered and it is not this API" is already the
	// diagnosis, and asking again cannot change it.
	if (first.answered || retries <= 0) return first.line;

	for (let attempt = 1; attempt <= retries; attempt++) {
		await sleep(delayMs);
		const again = await probeApiTargetOnce();
		if (again.answered) {
			return `${again.line} (came up after ${attempt} retr${attempt === 1 ? 'y' : 'ies'})`;
		}
	}
	const waited = Math.round((retries * delayMs) / 1000);
	return `${first.line} Kept looking for ${waited}s.`;
}

export type ApiProbeOptions = {
	/**
	 * Extra attempts, spaced `delayMs` apart, for the case where the api container is still booting.
	 *
	 * In `compose.yml` the web service starts as soon as the api container starts, and the api spends a
	 * few seconds applying migrations before it binds :8000. Without retries the first line the web
	 * container ever logs is "is the api running?" — which is true for about five seconds and then
	 * never true again, and a startup log that lies once is worse than one that says nothing.
	 */
	retries?: number;
	delayMs?: number;
};

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

type Probe = { answered: true; line: string } | { answered: false; line: string };

async function probeApiTargetOnce(): Promise<Probe> {
	const url = `${baseUrl()}/api/health`;
	let response: Response;
	try {
		response = await fetch(url, {
			headers: { accept: 'application/json' },
			signal: AbortSignal.timeout(STARTUP_TIMEOUT_MS)
		});
	} catch {
		return {
			answered: false,
			line: `nothing answered ${url} — is the api running? Submissions and /admin will fail.`
		};
	}

	const body: unknown = await response.json().catch(() => null);
	const version =
		body && typeof body === 'object' && typeof (body as { version?: unknown }).version === 'string'
			? (body as { version: string }).version
			: null;

	if (response.ok && version !== null) {
		const database =
			(body as { database?: unknown }).database === 'up' ? 'database up' : 'DATABASE DOWN';
		const predating = await routesThisApiDoesNotServe();
		if (predating.length > 0) {
			return {
				answered: true,
				line:
					`talking to techshare-api ${version} at ${baseUrl()} (${database}) — but it does not serve ` +
					`${predating.join(', ')}, so that process predates those routes. Restart it ` +
					'(npm run api:dev passes --reload).'
			};
		}
		return {
			answered: true,
			line: `talking to techshare-api ${version} at ${baseUrl()} (${database})`
		};
	}
	return {
		answered: true,
		line:
			`something answered ${url} but it is not this API (status ${response.status}` +
			`${version === null ? ', no version in the body' : ''}) — every submission and /admin call will ` +
			'404. Check API_URL.'
	};
}

/** The routes `src/lib/api.ts` calls, and that therefore have to exist on whatever `API_URL` names. */
const ROUTES_THE_WEB_CALLS = ['/api/projects', '/api/submissions', '/api/admin/projects'];

/** Which of those a live `/openapi.json` does not list. Empty means the process is current. */
export function missingApiRoutes(openapi: unknown): string[] {
	const paths =
		openapi && typeof openapi === 'object' ? (openapi as { paths?: unknown }).paths : undefined;
	if (!paths || typeof paths !== 'object') return ROUTES_THE_WEB_CALLS;
	const known = Object.keys(paths as Record<string, unknown>);
	return ROUTES_THE_WEB_CALLS.filter((route) => !known.includes(route));
}

/** Empty when we cannot tell — a missing `/openapi.json` is not worth crying wolf about. */
async function routesThisApiDoesNotServe(): Promise<string[]> {
	try {
		const response = await fetch(`${baseUrl()}/openapi.json`, {
			headers: { accept: 'application/json' },
			signal: AbortSignal.timeout(STARTUP_TIMEOUT_MS)
		});
		return response.ok ? missingApiRoutes(await response.json()) : [];
	} catch {
		return [];
	}
}

// --- /admin: the same service, behind the reviewer's session ---------------------------------

/**
 * What an admin is told when the API stops accepting their cookie.
 *
 * Deliberately not FastAPI's words: the API says "that session has expired" only when it happens to
 * know why, and the useful instruction — sign in again — is the same for every reason.
 */
export const ADMIN_SESSION_MESSAGE =
	'That admin session is no longer valid. Sign in again — nothing you were editing was lost.';

export const ADMIN_DOWN_MESSAGE =
	'The project service is not responding, so nothing was changed. Try again in a moment.';

type AdminRequest = {
	token: string;
	path: string;
	method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
	/** Sent as JSON when present; `undefined` means a bodyless request. */
	body?: unknown;
	/** A 404 is one of these answers rather than a fault: the caller raises its own 404 page. */
	allowMissing?: boolean;
};

/**
 * One call to `/api/admin/*`, carrying the session token as a bearer credential.
 *
 * The token comes from the signed cookie, never from the browser: SvelteKit reads it in a server
 * route and hands it here. FastAPI checks the signature itself (`api/app/auth.py`), so this is not
 * the thing deciding who is an admin — it is the thing that has to say "I am not" in a sentence.
 */
async function adminCall<T>({
	token,
	path,
	method = 'GET',
	body,
	allowMissing = false
}: AdminRequest): Promise<T | null> {
	let response: Response;
	try {
		response = await fetch(`${baseUrl()}${path}`, {
			method,
			headers: {
				accept: 'application/json',
				authorization: `Bearer ${token}`,
				...(body === undefined ? {} : { 'content-type': 'application/json' })
			},
			body: body === undefined ? undefined : JSON.stringify(body),
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
	} catch (cause) {
		const reason = cause instanceof Error ? cause.message : 'fetch failed';
		throw new ApiError('unreachable', `${ADMIN_DOWN_MESSAGE} (${reason})`);
	}

	if (response.status === 401 || response.status === 403) {
		throw new ApiError('unauthorized', ADMIN_SESSION_MESSAGE, response.status);
	}
	if (response.status === 404) {
		const detail = await readDetail(response);
		if (allowMissing) return null;
		// Only a signed-in reviewer ever sees this text (the guard bounces everyone else before the
		// load runs), so it can name the base URL without handing anything to an outsider.
		throw new ApiError('bad-response', unroutedMessage(path, detail), 404);
	}
	if (response.status === 204) return null;
	if (!response.ok) {
		// A 4xx here is the API refusing an edit, and its `detail` is written for the reviewer, so it
		// goes to the screen. A 5xx is ours to explain.
		const detail = await readDetail(response);
		throw new ApiError(
			'bad-response',
			detail ??
				(response.status >= 500
					? ADMIN_DOWN_MESSAGE
					: `The project service answered ${response.status} at ${baseUrl()}.`),
			response.status
		);
	}
	if (method === 'DELETE') return null;
	try {
		return (await response.json()) as T;
	} catch {
		throw new ApiError('bad-response', 'The project service returned malformed JSON.');
	}
}

/** The review queue. `status` defaults to `pending`, which is the only list an admin needs first. */
export async function adminListProjects(
	token: string,
	status: StatusFilter = 'pending'
): Promise<AdminProjectSummary[]> {
	return (
		(await adminCall<AdminProjectSummary[]>({
			token,
			path: `/api/admin/projects?status=${status}`
		})) ?? []
	);
}

/** One project for the editor, including the Markdown. `null` when the id is not a project. */
export async function adminGetProject(
	token: string,
	id: number
): Promise<AdminProjectDetail | null> {
	return await adminCall<AdminProjectDetail>({
		token,
		path: `/api/admin/projects/${id}`,
		allowMissing: true
	});
}

/** Save metadata and/or the body. The returned detail is the saved state, not what was sent. */
export async function adminEditProject(
	token: string,
	id: number,
	edit: AdminProjectEdit
): Promise<AdminProjectDetail> {
	const saved = await adminCall<AdminProjectDetail>({
		token,
		path: `/api/admin/projects/${id}`,
		method: 'PATCH',
		body: edit,
		allowMissing: true
	});
	if (!saved) throw new ApiError('bad-response', 'That project is no longer in the database.', 404);
	return saved;
}

/** The publish / reject / reopen transition, on its own so it can never be part of a bigger save. */
export async function adminSetStatus(
	token: string,
	id: number,
	status: Status
): Promise<AdminProjectSummary | null> {
	return await adminCall<AdminProjectSummary>({
		token,
		path: `/api/admin/projects/${id}/status`,
		method: 'POST',
		body: { status },
		allowMissing: true
	});
}

/** Remove the project and, on the API side, the `.docx` it came from. No second chance. */
export async function adminDeleteProject(token: string, id: number): Promise<boolean> {
	await adminCall<null>({
		token,
		path: `/api/admin/projects/${id}`,
		method: 'DELETE',
		allowMissing: true
	});
	return true;
}

/**
 * Render a draft through the same pipeline a saved body goes through, and store nothing.
 *
 * The editor cannot render this itself: sanitizing Markdown is the API's job (locked decision #13),
 * and a second implementation in the browser would be a second thing to get wrong.
 */
export async function adminPreview(token: string, markdown: string): Promise<string> {
	const result = await adminCall<{ body_html: string }>({
		token,
		path: '/api/admin/preview',
		method: 'POST',
		body: { markdown }
	});
	return result?.body_html ?? '';
}

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export type Options = {
	contributors: string[];
	tools: string[];
	departments: string[];
};

export type Project = {
	id: number;
	title: string;
	description_markdown: string;
	description_html: string;
	contributors: string[];
	tools: string[];
	department: string;
	submitter_email: string;
	status: string;
	submitted_at: string;
	reviewed_at: string | null;
	reviewed_by: string | null;
	rejection_reason: string | null;
	detail_slug: string;
};

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
	const headers = new Headers(options.headers);
	if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
		headers.set('Content-Type', 'application/json');
	}

	const response = await fetch(`${API_URL}${path}`, {
		...options,
		credentials: 'include',
		headers
	});
	if (!response.ok) {
		const body = await response.json().catch(() => ({}));
		throw new Error(body.detail ?? `Request failed (${response.status})`);
	}
	if (response.status === 204) return undefined as T;
	return response.json();
}

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

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
	const response = await fetch(`${API_URL}${path}`, {
		...options,
		credentials: 'include',
		headers: { 'Content-Type': 'application/json', ...options.headers }
	});
	if (!response.ok) {
		const body = await response.json().catch(() => ({}));
		throw new Error(body.detail ?? `Request failed (${response.status})`);
	}
	return response.json();
}

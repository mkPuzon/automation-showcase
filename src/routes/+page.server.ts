// Explore: one server-side fetch of every published project's metadata; filtering after that
// happens in the browser (locked decision #10). If FastAPI is down we still render the page and
// say so rather than showing SvelteKit's error page.

import { API_DOWN_MESSAGE, ApiError, listProjects } from '#lib/api';
import type { ProjectSummary } from '#lib/types';
import type { PageServerLoad } from './$types';

export const load = (async (): Promise<{ projects: ProjectSummary[]; problem: string | null }> => {
	try {
		return { projects: await listProjects(), problem: null };
	} catch (cause) {
		if (cause instanceof ApiError) {
			return {
				projects: [],
				problem: cause.problem === 'unreachable' ? API_DOWN_MESSAGE : cause.message
			};
		}
		throw cause;
	}
}) satisfies PageServerLoad;

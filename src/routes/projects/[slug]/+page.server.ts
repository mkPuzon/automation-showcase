import { error } from '@sveltejs/kit';
import { API_DOWN_MESSAGE, ApiError, getProject } from '#lib/api';
import type { PageServerLoad } from './$types';

export const load = (async ({ params }) => {
	let project;
	try {
		project = await getProject(params.slug);
	} catch (cause) {
		if (cause instanceof ApiError) {
			error(503, cause.problem === 'unreachable' ? API_DOWN_MESSAGE : cause.message);
		}
		throw cause;
	}

	if (!project) {
		// Also the right message for a write-up that is still pending or was rejected: those
		// slugs exist in the database but are not public.
		error(
			404,
			'No published project lives at that address — it may have been renamed, or it may still be awaiting review.'
		);
	}
	return { project };
}) satisfies PageServerLoad;

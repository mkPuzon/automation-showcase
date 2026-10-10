/**
 * `/admin/dashboard`: the queue.
 *
 * Read-only on purpose. One row per write-up, filtered by status, each row linking to the editor —
 * every mutation (publish, reject, edit, delete) lives on the editor page so there is exactly one place
 * where a status changes and exactly one place where a row can be destroyed. A queue you can
 * accidentally publish from with a stray Enter is worse than two extra clicks.
 *
 * The list arrives once, unfiltered: the status tabs' counts, the search, and the visible rows all
 * read the same payload, so a count can never disagree with the list it sits on. This deployment has
 * hundreds of write-ups, not millions — one query is the whole budget the dashboard gets.
 *
 * The email column is the reason this page exists: a reviewer has to be able to answer the person who
 * wrote the thing. It comes from `/api/admin`, which is the only API surface that carries it.
 */

import { error, redirect } from '@sveltejs/kit';
import { ApiError, adminListProjects } from '#lib/api';
import { SIGN_IN_PATH, endSession, requireAdminToken } from '#lib/admin-guard';
import { noticeFor, statusFilterFrom } from '#lib/admin-queue';
import { authorName } from '#lib/format';
import type { AdminProjectSummary, StatusFilter } from '#lib/types';
import type { Actions, PageServerLoad } from './$types';

/** Every word the reviewer typed has to land somewhere in the row for the row to stay. */
function matches(project: AdminProjectSummary, terms: string[]): boolean {
	const hay = [
		project.title,
		project.department,
		authorName(project.submitter),
		project.submitter.email,
		...project.technologies
	]
		.join(' ')
		.toLowerCase();
	return terms.every((term) => hay.includes(term));
}

export const load = (async ({ cookies, url }) => {
	const token = requireAdminToken(cookies);
	const status = statusFilterFrom(url.searchParams.get('status'));
	const q = (url.searchParams.get('q') ?? '').trim();
	const terms = q ? q.toLowerCase().split(/\s+/) : [];

	let everything: AdminProjectSummary[];
	try {
		everything = await adminListProjects(token, 'all');
	} catch (cause) {
		if (cause instanceof ApiError) {
			// The API refusing a cookie we still believe in means the two services disagree about
			// SESSION_SECRET, or this one has aged out faster over there. Either way: sign in again.
			if (cause.problem === 'unauthorized') redirect(303, `${SIGN_IN_PATH}?out=expired`);
			error(503, cause.message);
		}
		throw cause;
	}

	const searched = terms.length ? everything.filter((p) => matches(p, terms)) : everything;

	// Counts count the search results, not the whole queue: "Waiting 2" next to a search box means
	// two pending write-ups match what was typed.
	const counts: Record<StatusFilter, number> = {
		pending: 0,
		published: 0,
		rejected: 0,
		all: searched.length
	};
	for (const project of searched) counts[project.status] += 1;

	const projects = status === 'all' ? searched : searched.filter((p) => p.status === status);

	return {
		status,
		q,
		counts,
		projects,
		notice: noticeFor(url.searchParams.get('notice')),
		deleted: url.searchParams.get('deleted')
	};
}) satisfies PageServerLoad;

export const actions = {
	logout: async ({ cookies }) => {
		endSession(cookies);
		redirect(303, `${SIGN_IN_PATH}?out=signed-out`);
	}
} satisfies Actions;

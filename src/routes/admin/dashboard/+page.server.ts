/**
 * `/admin/dashboard`: the queue.
 *
 * Read-only on purpose. One row per write-up, filtered by status, each row linking to the editor —
 * every mutation (publish, reject, edit, delete) lives on the editor page so there is exactly one place
 * where a status changes and exactly one place where a row can be destroyed. A queue you can
 * accidentally publish from with a stray Enter is worse than two extra clicks.
 *
 * The email column is the reason this page exists: a reviewer has to be able to answer the person who
 * wrote the thing. It comes from `/api/admin`, which is the only API surface that carries it.
 */

import { error, redirect } from '@sveltejs/kit';
import { ApiError, adminListProjects } from '#lib/api';
import { SIGN_IN_PATH, endSession, requireAdminToken } from '#lib/admin-guard';
import { noticeFor, statusFilterFrom } from '#lib/admin-queue';
import type { AdminProjectSummary } from '#lib/types';
import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ cookies, url }) => {
	const token = requireAdminToken(cookies);
	const status = statusFilterFrom(url.searchParams.get('status'));

	let projects: AdminProjectSummary[];
	try {
		projects = await adminListProjects(token, status);
	} catch (cause) {
		if (cause instanceof ApiError) {
			// The API refusing a cookie we still believe in means the two services disagree about
			// SESSION_SECRET, or this one has aged out faster over there. Either way: sign in again.
			if (cause.problem === 'unauthorized') redirect(303, `${SIGN_IN_PATH}?out=expired`);
			error(503, cause.message);
		}
		throw cause;
	}

	// One query for the whole queue: this deployment has hundreds of write-ups, not millions, so the
	// dashboard does not get a counting pass of its own.
	return {
		status,
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

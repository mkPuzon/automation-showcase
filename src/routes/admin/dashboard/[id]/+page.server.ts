/**
 * `/admin/dashboard/<id>`: one write-up, and every change that can be made to it.
 *
 * Four actions, deliberately not merged:
 *
 * - `save` — title, unit, lists, body. Never sends `slug`.
 * - `slug` — the web address, on its own, behind its own button and its own warning. Renaming a
 *   project must not move its URL, so the code that could move the URL is a different request from the
 *   one that fixes a typo in the title (locked decision #4).
 * - `status` — pending / published / rejected. Publishing is not a side effect of saving: it is a
 *   button of its own, so it cannot happen by accident.
 * - `delete` — the row and, on the API, the `.docx` it came from. Needs the confirmation box ticked,
 *   enforced by the browser and again here.
 *
 * Every one of them starts with `requireAdminToken`: form actions do not run the layout's guard.
 */

import { error, fail, redirect } from '@sveltejs/kit';
import {
	ApiError,
	adminDeleteProject,
	adminEditProject,
	adminGetProject,
	adminPreview,
	adminSetStatus
} from '#lib/api';
import { SIGN_IN_PATH, requireAdminToken } from '#lib/admin-guard';
import { noticeFor } from '#lib/admin-queue';
import { parseList } from '#lib/validation';
import type { AdminProjectDetail, AdminProjectEdit, Status } from '#lib/types';
import type { Actions, PageServerLoad } from './$types';

const STATUSES: string[] = ['pending', 'published', 'rejected'];
const CONFIRMATION =
	'Tick the box to confirm — this deletes the write-up, its queue entry and its original file.';

/** What the form looks like when it has to be handed back: exactly what was typed, lists and all. */
function draftFrom(data: FormData) {
	const text = (name: string) => String(data.get(name) ?? '');
	return {
		title: text('title').trim(),
		department: text('department').trim(),
		technologies: parseList(text('technologies')).join(', '),
		contributors: parseList(text('contributors')).join(', '),
		body_markdown: text('body_markdown')
	};
}

type Draft = ReturnType<typeof draftFrom>;

/** The lists are one input each in the form and one array each in the database. */
function editFrom(draft: Draft): AdminProjectEdit {
	return {
		title: draft.title,
		department: draft.department,
		technologies: parseList(draft.technologies),
		contributors: parseList(draft.contributors),
		body_markdown: draft.body_markdown
	};
}

/**
 * A write-up number from the URL, or a 404.
 *
 * `Number('')` is 0 and `Number(' 12 ')` is 12, hence the order of the checks: anything that is not a
 * positive integer is not a project, and is not worth a round trip to the API to find out.
 */
function idFrom(raw: string): number {
	const id = Number(raw);
	if (!Number.isInteger(id) || id < 1) error(404, 'That is not a write-up number.');
	return id;
}

/**
 * Turn a failed API call into the page an admin should see, and never continue past it.
 *
 * A refused cookie means the session is not live over there (aged out, or the two services disagree
 * about `SESSION_SECRET`) and the answer is the sign-in page. A 4xx from a *write* is returned to the
 * action instead of reaching here — that one is the API refusing what was typed, which the form shows.
 */
function describe(cause: unknown): never {
	if (cause instanceof ApiError) {
		if (cause.problem === 'unauthorized') redirect(303, `${SIGN_IN_PATH}?out=expired`);
		error(503, cause.message);
	}
	throw cause;
}

/** True for "the API looked at what the admin typed and said no" — a sentence worth showing. */
function refused(cause: unknown): cause is ApiError & { status: number } {
	return cause instanceof ApiError && typeof cause.status === 'number' && cause.status < 500;
}

async function loadProject(token: string, id: number): Promise<AdminProjectDetail> {
	try {
		const project = await adminGetProject(token, id);
		if (!project) error(404, 'No write-up with that number. It may have been deleted.');
		return project;
	} catch (cause) {
		return describe(cause);
	}
}

export const load = (async ({ cookies, params, url }) => {
	const token = requireAdminToken(cookies);
	const project = await loadProject(token, idFrom(params.id));
	return {
		project,
		notice: noticeFor(url.searchParams.get('notice')),
		// Where "back to the queue" and a completed delete should land. The queue the admin was looking
		// at if the link carried one, otherwise the filter this write-up would be found under.
		queue: url.searchParams.get('status') || project.status
	};
}) satisfies PageServerLoad;

export const actions = {
	save: async ({ cookies, request, params }) => {
		const token = requireAdminToken(cookies);
		const id = idFrom(params.id);
		const draft = draftFrom(await request.formData());

		try {
			const saved = await adminEditProject(token, id, editFrom(draft));
			// 303 after a write: reloading the editor must not post the same edit a second time.
			redirect(303, `/admin/dashboard/${saved.id}?notice=saved`);
		} catch (cause) {
			if (refused(cause)) return fail(cause.status, { message: cause.message, draft });
			return describe(cause);
		}
	},

	/**
	 * The only request that moves a URL — separate from `save` so a title correction on a published
	 * write-up cannot take its links with it.
	 */
	slug: async ({ cookies, request, params }) => {
		const token = requireAdminToken(cookies);
		const id = idFrom(params.id);
		const wanted = String((await request.formData()).get('slug') ?? '').trim();

		if (wanted === '') {
			return fail(422, { slugMessage: 'Type the web address you want, or leave this alone.' });
		}

		try {
			await adminEditProject(token, id, { slug: wanted });
			redirect(303, `/admin/dashboard/${id}?notice=slug-changed`);
		} catch (cause) {
			if (refused(cause)) return fail(cause.status, { slugMessage: cause.message });
			return describe(cause);
		}
	},

	status: async ({ cookies, request, params }) => {
		const token = requireAdminToken(cookies);
		const id = idFrom(params.id);
		const status = String((await request.formData()).get('status') ?? '');

		if (!STATUSES.includes(status)) {
			return fail(422, { statusMessage: 'That is not one of the three statuses.' });
		}

		try {
			await adminSetStatus(token, id, status as Status);
			redirect(303, `/admin/dashboard/${id}?notice=${status}`);
		} catch (cause) {
			if (refused(cause)) return fail(cause.status, { statusMessage: cause.message });
			return describe(cause);
		}
	},

	delete: async ({ cookies, request, params }) => {
		const token = requireAdminToken(cookies);
		const id = idFrom(params.id);
		const data = await request.formData();
		const queue = String(data.get('queue') ?? 'pending');

		// The box is `required` in the form; this is the same rule for whoever skips the form.
		if (String(data.get('confirm') ?? '') !== 'yes') {
			return fail(422, { deleteMessage: CONFIRMATION });
		}

		try {
			// Read the title before the row goes, so the queue can say what it just lost.
			const { title } = await loadProject(token, id);
			await adminDeleteProject(token, id);
			redirect(
				303,
				`/admin/dashboard?status=${encodeURIComponent(queue)}&deleted=${encodeURIComponent(title)}`
			);
		} catch (cause) {
			if (refused(cause)) return fail(cause.status, { deleteMessage: cause.message });
			return describe(cause);
		}
	},

	/**
	 * Render the draft in the textarea without saving it. Returns instead of redirecting: the point is
	 * the page with the text still in it.
	 */
	preview: async ({ cookies, request }) => {
		const token = requireAdminToken(cookies);
		const draft = draftFrom(await request.formData());
		try {
			return { preview: await adminPreview(token, draft.body_markdown), draft };
		} catch (cause) {
			if (cause instanceof ApiError) return fail(503, { message: cause.message, draft });
			throw cause;
		}
	}
} satisfies Actions;

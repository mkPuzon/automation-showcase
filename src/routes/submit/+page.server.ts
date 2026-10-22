/**
 * `/submit`: render the form, then file the write-up as a `pending` project.
 *
 * The action's order is the order the checks belong in — cheapest and most likely first — and it
 * never touches the uploads volume or the database: FastAPI owns those (`POST /api/submissions`),
 * including `.docx` parsing, the transaction and the file-size/type caps it can enforce from its own
 * side. This layer is anti-bot, the metadata rules, and turning whatever comes back into something
 * the form can show.
 *
 * The per-IP rate limit is deliberately *not* here: `src/hooks.server.ts` runs it before this action
 * and bounces with a redirect. The minimum render→submit delay is here because it needs the body.
 */

import { fail, type ActionFailure } from '@sveltejs/kit';
import { SESSION_SECRET } from '$app/env/private';
import { ApiError, submitProject } from '#lib/api';
import { checkRenderToken, issueRenderToken, renderTokenMessage } from '#lib/antibot';
import { formatWait } from '#lib/rate-limit';
import {
	HONEYPOT_FIELD,
	formValuesFrom,
	validateSubmission,
	type SubmissionDraft,
	type SubmissionErrors,
	type SubmissionFormValues
} from '#lib/validation';
import type { SubmissionResult } from '#lib/types';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/** Same sentence as `BOT_MESSAGE` in api/app/routers/submissions.py — tells a bot nothing. */
const BOT_MESSAGE = 'That submission could not be accepted.';
const NEEDS_FIXING = 'Some fields need another look — they are marked below.';

/** What the form may be handed back after anything short of success. */
export interface SubmissionFailure {
	ok?: false;
	message?: string | null;
	values?: SubmissionFormValues;
	errors?: SubmissionErrors;
}

export interface SubmissionSuccess {
	ok: true;
	submission: SubmissionResult;
	warning: string | null;
}

/** What this action can return: a filed write-up, or a verdict for the form to show. */
type SubmitResult = Promise<SubmissionSuccess | ActionFailure<SubmissionFailure>>;

export const load = (async ({ url }) => {
	// `?limited=<seconds>` is how src/hooks.server.ts tells us it bounced a submission.
	const limited = url.searchParams.get('limited');
	return {
		// Re-issued on every render, so waiting out a rate limit does not expire the form.
		renderToken: issueRenderToken(SESSION_SECRET),
		template_url: '/project-template.docx',
		waited: limited === null ? null : formatWait(Math.max(1, Number(limited) || 0))
	};
}) satisfies PageServerLoad;

/** One comma-separated string per list field, which is what the form's rules expect. */
function draftFrom(data: FormData): SubmissionDraft {
	const text = (name: string) => String(data.get(name) ?? '');
	const list = (name: string) =>
		data
			.getAll(name)
			.map(String)
			.filter((value) => value !== '')
			.join(', ');
	const file = data.get('document');
	return {
		first_name: text('first_name'),
		last_name: text('last_name'),
		email: text('email'),
		department: text('department'),
		title: text('title'),
		technologies: list('technologies'),
		contributors: list('contributors'),
		document: file instanceof File && file.size > 0 ? file : null
	};
}

export const actions = {
	default: async ({ request }: RequestEvent): SubmitResult => {
		let data: FormData;
		try {
			data = await request.formData();
		} catch {
			// Not a multipart body at all: a scanner, or a request built by something other than us.
			return fail(400, { message: BOT_MESSAGE });
		}

		// Validating first, before any of the anti-bot checks, buys us the normalized values to echo
		// back into the form however the submission ends.
		const draft = draftFrom(data);
		const check = validateSubmission(draft);
		const echo = formValuesFrom(check.values);

		if (String(data.get(HONEYPOT_FIELD) ?? '').trim() !== '') {
			return fail(422, { message: BOT_MESSAGE, values: echo });
		}

		const token = checkRenderToken(data.get('render_token'), SESSION_SECRET);
		if (!token.ok) {
			return fail(422, { message: renderTokenMessage(token), values: echo });
		}

		if (Object.keys(check.errors).length > 0) {
			return fail(422, { message: NEEDS_FIXING, errors: check.errors, values: echo });
		}

		// validateSubmission only clears `document` when a usable file is attached.
		const document = draft.document as File;
		try {
			const submission = await submitProject(check.values, document);
			return { ok: true, submission, warning: submission.warning ?? check.warning };
		} catch (cause) {
			if (cause instanceof ApiError) {
				// On a 4xx this message is FastAPI's own — it knows why the document was refused and is
				// written for the submitter. On a 5xx it is ours. Either way, nothing was filed.
				return fail(cause.status ?? 503, {
					message: cause.message,
					values: echo,
					errors: {}
				});
			}
			throw cause;
		}
	}
} satisfies Actions;

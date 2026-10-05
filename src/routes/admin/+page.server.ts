/**
 * `/admin`: the sign-in page, and the only place the admin password is compared to anything.
 *
 * There is no token endpoint and no password check on the FastAPI side: SvelteKit owns the credential
 * and hands out a signed cookie (`#lib/admin-session.ts`), and the API verifies that cookie on each of
 * its own `/api/admin` routes. The browser is never given the token, and never sees the password
 * again after pressing Enter.
 *
 * Brute force is `src/hooks.server.ts`'s job — it counts attempts per IP before the body is even read
 * and bounces with `?limited=<seconds>`, which this load reads the same way `/submit` does.
 *
 * One action, and it has to stay that way: Kit refuses to dispatch a `default` action on a route that
 * also exports a named one (`kit/action_default_with_named`) and answers the POST with a 500 before any
 * of this code runs. Signing out is `/admin/dashboard`'s `?/logout`, which is where the button is.
 */

import { fail, redirect } from '@sveltejs/kit';
import { adminIsConfigured, passwordMatches, sessionsCanBeSigned } from '#lib/admin-session';
import {
	DASHBOARD_PATH,
	adminTokenFrom,
	startSession,
	signOutMessage,
	configurationMessage
} from '#lib/admin-guard';
import { formatWait } from '#lib/rate-limit';
import type { Actions, PageServerLoad } from './$types';

/** A wrong password says nothing more than this; whether a username exists is not a thing here. */
const WRONG_PASSWORD = 'That password is not right.';
const NEEDS_PASSWORD = 'Type the admin password.';

export const load = (async ({ cookies, url }) => {
	// Already signed in? The form would only sign them in again.
	if (adminTokenFrom(cookies) !== null) redirect(303, DASHBOARD_PATH);

	const limited = url.searchParams.get('limited');
	return {
		// Two different kinds of "not now": no password to check, and no secret to sign with.
		configured: adminIsConfigured() && sessionsCanBeSigned(),
		notice: signOutMessage(url.searchParams.get('out')) ?? configurationMessage(),
		waited: limited === null ? null : formatWait(Math.max(1, Number(limited) || 0))
	};
}) satisfies PageServerLoad;

export const actions = {
	default: async ({ cookies, request }) => {
		if (!adminIsConfigured() || !sessionsCanBeSigned()) {
			// Nothing to authenticate against. Reaching this by POST means the form was open before the
			// environment changed, so say so rather than reporting a wrong password.
			return fail<{ message: string }>(503, {
				message: configurationMessage() ?? 'Admin sign-in is not available.'
			});
		}

		let data: FormData;
		try {
			data = await request.formData();
		} catch {
			return fail<{ message: string }>(400, { message: 'That sign-in request could not be read.' });
		}

		const password = String(data.get('password') ?? '');
		if (password === '') return fail<{ message: string }>(422, { message: NEEDS_PASSWORD });

		if (!passwordMatches(password)) {
			// No cookie, no hint, and the attempt is already counted by the hook.
			return fail<{ message: string }>(401, { message: WRONG_PASSWORD });
		}

		startSession(cookies);
		redirect(303, DASHBOARD_PATH);
	}
} satisfies Actions;

/**
 * Who may see `/admin`, in one place.
 *
 * `admin-session.ts` knows how to read a session cookie; this knows what to do with the answer. Two
 * entry points, and every admin route uses one of them:
 *
 * - `adminTokenFrom` for the login page, which is allowed to find no session (that is its normal case).
 * - `requireAdminToken` for everything else, which redirects to the login page instead of rendering.
 *
 * Both halves of a guarded route have to call it. A layout guard alone is not enough: form actions run
 * without the layout's `load`, so a `POST /admin/dashboard/42?/delete` from curl never touches the
 * guard unless the action itself asks. That is the one line of this file that matters most.
 *
 * Server-only: it reads the cookie jar, and a token must never reach the browser.
 */

import { redirect } from '@sveltejs/kit';
import {
	SESSION_COOKIE,
	adminIsConfigured,
	sessionCookie,
	sessionIsValid,
	signSession
} from '#lib/admin-session';
import type { Cookies } from '@sveltejs/kit';

/** The sign-in page, and the queue it sends you to. */
export const SIGN_IN_PATH = '/admin';
export const DASHBOARD_PATH = '/admin/dashboard';

/** Shown when a cookie has run out or was signed with a key this process no longer has. */
export const EXPIRED_MESSAGE =
	'That admin session has run out. Sign in again to pick the queue back up.';

/** Shown after signing out, so the empty form has a reason attached to it. */
export const SIGNED_OUT_MESSAGE = 'You are signed out of the review queue.';

/**
 * The session token, or null.
 *
 * `null` covers three cases on purpose — no cookie, an expired one, a forged one. The difference is
 * nothing an unauthenticated visitor can act on, and collapsing them keeps the login page from
 * becoming an oracle for "your cookie is nearly right".
 */
export function adminTokenFrom(cookies: Cookies): string | null {
	const token = cookies.get(SESSION_COOKIE);
	return token && sessionIsValid(token) ? token : null;
}

/**
 * The session token, or a redirect to the sign-in page.
 *
 * 303 rather than 307: the login page is a form, not the page that was asked for, and a redirect that
 * keeps the method would POST the reviewer's half-typed edit at it.
 */
export function requireAdminToken(cookies: Cookies): string {
	const token = adminTokenFrom(cookies);
	if (token === null) redirect(303, `${SIGN_IN_PATH}?out=expired`);
	return token;
}

/** Hand out a session. Called by the sign-in action and nowhere else. */
export function startSession(cookies: Cookies): void {
	cookies.set(SESSION_COOKIE, signSession(), sessionCookie());
}

/**
 * Take it back. The cookie is cleared with the same attributes it was set with — a `path` of `/admin`
 * has to match, or the browser keeps the real one and the logout looks like it did nothing.
 *
 * The token itself is not revoked, because there is nothing to revoke it in: it is a signature, not a
 * row. Signing out drops the copy the browser holds, which is the threat this is aimed at (someone
 * else at the same browser), and `SESSION_SECRET` is the answer to the rest.
 */
export function endSession(cookies: Cookies): void {
	cookies.set(SESSION_COOKIE, '', sessionCookie(0));
}

/** The message for `?out=`, or null when nobody was bounced. */
export function signOutMessage(reason: string | null): string | null {
	if (reason === 'expired') return EXPIRED_MESSAGE;
	if (reason === 'signed-out') return SIGNED_OUT_MESSAGE;
	return null;
}

/**
 * What the login page says when there is no password to type.
 *
 * Not a 404 and not a blank page: an admin who finds `/admin` on a deployment that has not set
 * `ADMIN_PASSWORD` should be told that is the state of things, because the alternative reading is
 * "the site is broken".
 */
export function configurationMessage(): string | null {
	if (adminIsConfigured()) return null;
	return (
		'Admin sign-in is not turned on: no admin password is set on this deployment. ' +
		'Set ADMIN_PASSWORD on the web service to enable it.'
	);
}

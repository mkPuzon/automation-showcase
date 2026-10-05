/**
 * The guard for everything under `/admin/dashboard`.
 *
 * This runs before any page load beneath it, so a queue or an editor page cannot be reached on a
 * stale cookie by typing the URL. It is not sufficient on its own — form actions do not run layout
 * loads — which is why every action in this subtree calls `requireAdminToken` itself as well.
 */

import { requireAdminToken } from '#lib/admin-guard';
import type { LayoutServerLoad } from './$types';

export const load = (async ({ cookies }) => {
	requireAdminToken(cookies);
	return {};
}) satisfies LayoutServerLoad;

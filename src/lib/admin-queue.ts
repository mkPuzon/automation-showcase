/**
 * The queue's query string.
 *
 * Two small things that both routes need to agree on, and neither can export from its own
 * `+page.server.ts` to share (SvelteKit allows only `load` and `actions` out of a route file): which
 * status the queue is showing, and what the `?notice=` after a redirect is supposed to say.
 *
 * Keeping the sentences here rather than in the pages is also what stops the dashboard and the editor
 * from describing the same publish two different ways.
 */

import type { StatusFilter } from './types';

/** The four views of the queue, in the order the tabs offer them. */
export const FILTERS: StatusFilter[] = ['pending', 'published', 'rejected', 'all'];

const NOTICES: Record<string, string> = {
	saved: 'Saved.',
	pending: 'Back in the queue as pending — it is not on Explore.',
	published: 'Published — it is on Explore now.',
	rejected: 'Marked rejected. Nobody outside admin sees it.',
	'slug-changed': 'The web address changed. Anything already linked to the old one will not follow.'
};

/**
 * The filter to show for `?status=`, defaulting to the queue nobody has read yet.
 *
 * Anything unrecognised — including `approved`, which was this project's fourth status until Phase 4
 * retired it — falls back to `pending` rather than erroring or silently showing everything. A stale
 * bookmark should land the reviewer where they meant to be, not in an empty list.
 */
export function statusFilterFrom(raw: string | null): StatusFilter {
	return (FILTERS as string[]).includes(raw ?? '') ? (raw as StatusFilter) : 'pending';
}

/** The sentence for `?notice=`, or null when there is nothing to report. */
export function noticeFor(raw: string | null): string | null {
	return NOTICES[raw ?? ''] ?? null;
}

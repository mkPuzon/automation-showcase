/** Small display helpers shared by the Explore grid and the project page. */

import type { SubmitterBrief } from '#lib/types';

// Seed/`.docx` timestamps are midnight UTC; without this a negative-offset browser shows
// the day before.
const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
	day: 'numeric',
	month: 'short',
	year: 'numeric',
	timeZone: 'UTC'
});

export function formatDate(iso: string): string {
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? iso : DATE_FORMAT.format(date);
}

export function authorName(submitter: SubmitterBrief): string {
	return `${submitter.first_name} ${submitter.last_name}`.trim();
}

/** "Marie Dubois · Computing Services" — the card's byline. */
export function byline(project: { department: string; submitter: SubmitterBrief }): string {
	return `${authorName(project.submitter)} · ${project.department}`;
}

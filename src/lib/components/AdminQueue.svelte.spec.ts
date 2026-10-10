/**
 * The review queue's rows.
 *
 * Small file, but it is the one screen an admin looks at first, and three of its behaviours are the
 * reason it exists at all: the submitter's email has to be reachable (that is the only place the API
 * exposes it), the row has to say whether the write-up is already public, and a pending row has to
 * say how long it has been waiting — the queue's whole clock.
 *
 * Run: npx vitest run src/lib/components/AdminQueue.svelte.spec.ts
 */

import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import AdminQueue from './AdminQueue.svelte';
import type { AdminProjectSummary } from '#lib/types';

function row(over: Partial<AdminProjectSummary> = {}): AdminProjectSummary {
	return {
		id: 42,
		slug: 'rubric-runner',
		title: 'Rubric Runner',
		department: 'Digital Learning Tools',
		technologies: ['Python'],
		contributors: [],
		status: 'pending',
		created_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
		updated_at: '2026-02-02T04:00:00Z',
		submitter: {
			id: 7,
			first_name: 'Ana',
			last_name: 'Rivera',
			departments: ['Digital Learning Tools'],
			email: 'a.rivera@colby.edu'
		},
		source_filename: 'rubric-runner.docx',
		source_path: '2026/02/rubric-runner.docx',
		...over
	};
}

const text = (container: Element) => (container.textContent ?? '').replace(/\s+/g, ' ');

describe('AdminQueue', () => {
	it('lists every write-up with a way to open it', () => {
		const { container } = render(AdminQueue, {
			projects: [row(), row({ id: 43, title: 'Library Signage Map', slug: 'library-signage-map' })]
		});

		expect(container.querySelectorAll('.admin-row').length).toBe(2);
		const hrefs = [...container.querySelectorAll<HTMLAnchorElement>('.admin-row__link')].map(
			(link) => link.getAttribute('href')
		);
		expect(hrefs).toContain('/admin/dashboard/42');
		expect(hrefs).toContain('/admin/dashboard/43');
	});

	it('makes the submitter answerable', () => {
		const { container } = render(AdminQueue, { projects: [row()] });

		const mail = container.querySelector<HTMLAnchorElement>('a[href^="mailto:"]');
		expect(mail?.getAttribute('href')).toBe('mailto:a.rivera@colby.edu');
		// Names, not ids: the reviewer has to recognise the person, and one submitter's name has been
		// used by two accounts before now.
		expect(text(container)).toContain('Ana Rivera');
	});

	it('says which state each row is in, in the vocabulary the API uses', () => {
		const { container } = render(AdminQueue, {
			projects: [row(), row({ id: 44, status: 'published' }), row({ id: 45, status: 'rejected' })]
		});

		const chips = [...container.querySelectorAll('.status')].map((chip) =>
			chip.textContent?.trim()
		);
		expect(chips).toEqual(['pending', 'published', 'rejected']);
		expect(container.querySelector('.status--published')).not.toBeNull();
	});

	it('tells a reviewer how long a pending write-up has been waiting', () => {
		const { container } = render(AdminQueue, { projects: [row()] });

		expect(text(container)).toMatch(/waiting 3 days/);
	});

	it('links out to the public page only where one exists', () => {
		const { container } = render(AdminQueue, {
			projects: [row(), row({ id: 46, status: 'published' })]
		});

		const live = [...container.querySelectorAll<HTMLAnchorElement>('a[href^="/projects/"]')];
		expect(live).toHaveLength(1);
		expect(live[0]?.getAttribute('href')).toBe('/projects/rubric-runner');
	});

	it('admits when a write-up has no original file, and when there is nothing to read', () => {
		const missing = render(AdminQueue, {
			projects: [row({ source_filename: null, source_path: null })]
		});
		expect(text(missing.container)).toContain('no original file');

		const empty = render(AdminQueue, { projects: [] });
		expect(text(empty.container)).toContain('Nothing here.');
		expect(empty.container.querySelector('.admin-row')).toBeNull();
	});

	it('says when a search found nothing, and offers the way back', () => {
		const { container } = render(AdminQueue, { projects: [], q: 'rubric' });

		expect(text(container)).toContain('Nothing matches');
		expect(container.querySelector<HTMLAnchorElement>('a[href="?status=all"]')).not.toBeNull();
	});
});

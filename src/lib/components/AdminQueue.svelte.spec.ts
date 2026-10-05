/**
 * The queue table.
 *
 * Small file, but it is the one screen an admin looks at first, and two of its behaviours are the
 * reason it exists at all: the submitter's email has to be reachable (that is the only place the API
 * exposes it), and the row has to say whether the write-up is already public.
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
		created_at: '2026-02-02T04:00:00Z',
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

		expect(container.querySelectorAll('tbody tr').length).toBe(2);
		const hrefs = [...container.querySelectorAll<HTMLAnchorElement>('tbody a')].map((link) =>
			link.getAttribute('href')
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
		expect(empty.container.querySelector('table')).toBeNull();
	});
});

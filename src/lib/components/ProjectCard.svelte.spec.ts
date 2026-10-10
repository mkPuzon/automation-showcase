/**
 * One card in the Explore grid.
 *
 * The card is the whole of Explore's information design: a department tab, title, who, tools, date —
 * and nothing else. No body text, no contributor names, no email address. So these tests are about two
 * things at once: that a reader can get from the grid into a write-up, and that the card does not
 * start showing what the design decided belongs on the project page.
 *
 * Run: npx vitest run src/lib/components/ProjectCard.svelte.spec.ts
 */

import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ProjectCard from './ProjectCard.svelte';
import { projects } from '../../tests/fixtures';

const rubric = projects.find((project) => project.title.startsWith('Grading 120'))!;
const directory = projects.find((project) => project.contributors.length > 0)!;

describe('ProjectCard', () => {
	it('makes the title the way into the write-up', async () => {
		render(ProjectCard, { project: rubric });

		const link = page.getByRole('link', { name: rubric.title });
		await expect.element(link).toBeInTheDocument();
		// The slug, not the id: `/projects/<slug>` is the address a reader would type or bookmark, and
		// it is the one that only exists for work that has been published.
		await expect.element(link).toHaveAttribute('href', `/projects/${rubric.slug}`);
	});

	it('puts the author on the face and the department on the folder tab', async () => {
		render(ProjectCard, { project: rubric });

		await expect.element(page.getByText('Jessie Chen', { exact: true })).toBeInTheDocument();
		await expect
			.element(page.getByText('Computational Science', { exact: true }))
			.toBeInTheDocument();
	});

	it('keeps contributor names off the card', async () => {
		// Contributors are on the project page and in the review queue. A card in a public grid is where
		// a name starts getting collected by something that never asked to see it — and the card is where
		// the grid's height budget lives, so one more line per card reflows the whole page.
		const { container } = render(ProjectCard, { project: directory });

		await expect.element(page.getByRole('link', { name: directory.title })).toBeInTheDocument();
		expect(container.textContent).not.toContain('Karen Vreeland');
		expect(container.querySelectorAll('li.tag').length).toBe(3);
	});

	it('lists the tools with a name that says what the list is for', async () => {
		render(ProjectCard, { project: rubric });

		const tags = page.getByRole('list', { name: `Technologies used by ${rubric.title}` });
		await expect.element(tags).toBeInTheDocument();
		for (const tool of ['Python', 'pandas', 'Google Docs']) {
			await expect.element(tags.getByText(tool)).toBeInTheDocument();
		}
	});

	it('leaves the tool list out entirely when there are none', async () => {
		// An empty `<ul>` renders as a stray bullet, and a card with no tools is normal, not an error.
		const { container } = render(ProjectCard, { project: { ...rubric, technologies: [] } });

		expect(container.querySelector('ul.tag-list')).toBeNull();
		await expect.element(page.getByRole('link', { name: rubric.title })).toBeInTheDocument();
	});

	it('puts the machine-readable date in the datetime attribute', async () => {
		const { container } = render(ProjectCard, { project: rubric });

		const posted = container.querySelector('time');
		expect(posted?.getAttribute('datetime')).toBe(rubric.created_at);
		// `formatDate` pins the zone to UTC and the locale to en-US, so the words are stable too — without
		// the UTC pin, a browser west of Greenwich would print the day before the seed date.
		expect(posted?.textContent).toBe('Oct 1, 2026');
		await expect.element(page.getByText('Posted Oct 1, 2026')).toBeInTheDocument();
	});
});

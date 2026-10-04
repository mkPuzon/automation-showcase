import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ProjectBrowser from './ProjectBrowser.svelte';
import { projects } from '../../tests/fixtures';

describe('ProjectBrowser', () => {
	it('renders a card per published project, with byline, technologies and date', async () => {
		const { container } = render(ProjectBrowser, { projects });
		const cards = () => container.querySelectorAll('article.project-card').length;

		await expect.poll(cards).toBe(3);
		await expect
			.element(page.getByRole('link', { name: 'Grading 120 Lab Reports with a Rubric Macro' }))
			.toHaveAttribute('href', '/projects/grading-120-lab-reports-2026-10-01-aa01');
		await expect
			.element(page.getByText('Jessie Chen · Computational Science').first())
			.toBeInTheDocument();
		// scoped to the card: the same words also appear as <option>s in the filter bar
		const rubricCard = page.getByRole('article').filter({ hasText: 'Rubric Macro' });
		await expect.element(rubricCard.getByText('pandas', { exact: true })).toBeInTheDocument();
		await expect.element(rubricCard.getByText('Google Docs', { exact: true })).toBeInTheDocument();
		await expect.element(page.getByText('Oct 1, 2026').first()).toBeInTheDocument();
		await expect.element(page.getByRole('status')).toHaveTextContent('3 of 3 projects');
	});

	it('narrows the grid as you filter, with no second request', async () => {
		const { container } = render(ProjectBrowser, { projects });
		const cards = () => container.querySelectorAll('article.project-card').length;
		await expect.poll(cards).toBe(3);

		await page.getByRole('searchbox', { name: 'Search titles' }).fill('watershed');
		await expect.poll(cards).toBe(1);
		await expect.element(page.getByRole('status')).toHaveTextContent('1 of 3 projects');
		await expect
			.element(page.getByRole('link', { name: /Watershed Sensor Exports/ }))
			.toBeInTheDocument();

		// a technology that the remaining project does not use -> nothing left
		await page.getByRole('combobox', { name: 'Technology' }).selectOptions('Python');
		await expect.poll(cards).toBe(0);
		await expect
			.element(page.getByText('No published project matches those filters.'))
			.toBeInTheDocument();

		await page.getByRole('button', { name: 'Clear filters' }).click();
		await expect.poll(cards).toBe(3);
		await expect.element(page.getByRole('status')).toHaveTextContent('3 of 3 projects');
	});

	it('filters the grid by author and by department', async () => {
		const { container } = render(ProjectBrowser, { projects });
		const cards = () => container.querySelectorAll('article.project-card').length;

		await page.getByRole('combobox', { name: 'Author' }).selectOptions('Marie Dubois');
		await expect.poll(cards).toBe(1);
		await page.getByRole('button', { name: 'Clear' }).click();

		await page.getByRole('combobox', { name: 'Department' }).selectOptions('Computational Science');
		await expect.poll(cards).toBe(1);
		await expect.element(page.getByRole('link', { name: /Rubric Macro/ })).toBeInTheDocument();
	});

	it('says so when nothing is published yet', async () => {
		const { container } = render(ProjectBrowser, { projects: [] });
		await expect.element(page.getByText('Nothing is published yet.')).toBeInTheDocument();
		expect(container.querySelectorAll('article.project-card').length).toBe(0);
	});
});

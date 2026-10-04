import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ProjectBody from './ProjectBody.svelte';
import { renderedWithLink } from '../../tests/fixtures';

type WindowWithTrojan = Window & { __techshare_pwned__?: number };

describe('ProjectBody', () => {
	it('renders the sanitized body FastAPI sent, with links that open safely', async () => {
		render(ProjectBody, {
			html: `<h2>Using it</h2><ol><li>Open the sheet</li></ol>${renderedWithLink}`,
			markdown: ''
		});

		await expect
			.element(page.getByRole('heading', { level: 2, name: 'Using it' }))
			.toBeInTheDocument();
		const link = page.getByRole('link', { name: 'roster sheet' });
		await expect.element(link).toHaveAttribute('target', '_blank');
		await expect.element(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
	});

	it('refuses a body with a live script and falls back to the Markdown source', async () => {
		const { container } = render(ProjectBody, {
			html: '<p>Looks fine</p><script>window.__techshare_pwned__ = 1</script>',
			markdown: '## Using it\n\nJust run it.'
		});

		await expect
			.element(page.getByText(/could not be displayed as formatted text/))
			.toBeInTheDocument();
		await expect.element(page.getByText('Just run it.')).toBeInTheDocument();

		expect(container.querySelector('script')).toBeNull();
		expect(container.textContent).not.toContain('Looks fine');
		expect((window as WindowWithTrojan).__techshare_pwned__).toBeUndefined();
	});

	it('refuses an injected event handler the same way', async () => {
		const { container } = render(ProjectBody, {
			html: '<p onclick="document.write(1)">hi</p>',
			markdown: 'safe source'
		});

		expect(container.querySelector('[onclick]')).toBeNull();
		await expect.element(page.getByText('safe source')).toBeInTheDocument();
	});

	it('handles a project with no body at all', async () => {
		render(ProjectBody, { html: '', markdown: '' });
		await expect
			.element(page.getByText('This project has no written-up body yet.'))
			.toBeInTheDocument();
	});
});

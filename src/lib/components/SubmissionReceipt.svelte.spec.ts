/**
 * The pending-confirmation screen. The important part to pin is what it does *not* do: a write-up
 * that has not been approved has no public page, so the receipt must not offer a link to one.
 */

import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SubmissionReceipt from './SubmissionReceipt.svelte';
import { pendingSubmission } from '../../tests/fixtures';

describe('SubmissionReceipt', () => {
	it('confirms the write-up is filed and what happens next', async () => {
		render(SubmissionReceipt, { submission: pendingSubmission, warning: null });

		await expect
			.element(page.getByRole('heading', { level: 1 }))
			.toHaveTextContent('Your write-up is in. Thank you.');
		await expect
			.element(
				page.getByText('Renaming 400 scanned syllabi without touching the filenames by hand')
			)
			.toBeInTheDocument();
		await expect.element(page.getByText('Pending review')).toBeInTheDocument();
		await expect.element(page.getByText('#41')).toBeInTheDocument();
		await expect
			.element(page.getByText(/Someone will read it before it appears on Explore/))
			.toBeInTheDocument();
	});

	it('does not link a pending write-up, which has no public page yet', () => {
		const { container } = render(SubmissionReceipt, {
			submission: pendingSubmission,
			warning: null
		});

		expect(container.querySelector(`a[href="/projects/${pendingSubmission.slug}"]`)).toBeNull();
		expect(container.querySelector('a[href="/"]')).not.toBeNull();
	});

	it('passes on the soft warning about an unusual email, without blocking anything', async () => {
		const warning =
			'That address looks unusual for a Colby account, so an admin may write to confirm it.';

		render(SubmissionReceipt, { submission: pendingSubmission, warning });

		await expect.element(page.getByText(/looks unusual for a Colby account/)).toBeInTheDocument();
	});

	it('offers a way to file another one', async () => {
		render(SubmissionReceipt, { submission: pendingSubmission, warning: null });

		await expect
			.element(page.getByRole('link', { name: 'Submit another write-up' }))
			.toHaveAttribute('href', '/submit');
	});
});

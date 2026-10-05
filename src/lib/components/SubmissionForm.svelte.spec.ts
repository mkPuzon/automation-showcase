/**
 * The Submit form, in a browser. The rules themselves are tested in `validation.spec.ts`; what is
 * worth pinning here is the *behaviour around* them: a bad form never reaches the network, a field
 * answers when it is left rather than only on submit, the server's verdict is shown when it arrives,
 * and the honeypot stays invisible to a human.
 */

import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SubmissionForm from './SubmissionForm.svelte';

const TOKEN = '1760000000000.abc123';
const TEMPLATE = 'https://docs.google.com/document/d/1techshare-template/edit';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function submitButton() {
	return page.getByRole('button', { name: 'Submit for review' });
}

/** Choosing a file in the only input that takes one. */
async function chooseFile(name: string, type: string) {
	const file = new File([new Uint8Array(2048)], name, { type });
	await page.getByLabelText(/\.docx\)/).upload(file);
}

function value(label: RegExp): string {
	return (page.getByLabelText(label).element() as HTMLInputElement).value;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('SubmissionForm', () => {
	it('asks for exactly what a project needs, and nothing about an account', async () => {
		render(SubmissionForm, { renderToken: TOKEN, template_url: TEMPLATE });

		for (const label of [
			/First name/,
			/Last name/,
			/Colby email/,
			/Department or unit/,
			/Title of the write-up/,
			/^Technologies/,
			/Contributors/,
			/\.docx\)/
		]) {
			await expect.element(page.getByLabelText(label)).toBeInTheDocument();
		}

		// No accounts (locked decision: anyone on campus can submit), so no password anywhere.
		expect(document.querySelector('input[type="password"]')).toBeNull();
		expect(document.querySelector('input[type="hidden"][name="render_token"]')).not.toBeNull();
	});

	it('hides the honeypot from people without hiding it from bots', () => {
		const { container } = render(SubmissionForm, { renderToken: TOKEN, template_url: TEMPLATE });

		const honeypot = container.querySelector<HTMLInputElement>('input[name="company"]');
		expect(honeypot).not.toBeNull();
		expect(honeypot?.getAttribute('tabindex')).toBe('-1');
		expect(honeypot?.closest('[aria-hidden="true"]')).not.toBeNull();
		// Off-screen rather than display:none: plenty of bots skip fields they cannot see, and the
		// field still offers a real box for a naive crawler to fill in.
		const wrapper = honeypot?.closest('.honeypot') as HTMLElement;
		expect(getComputedStyle(wrapper).display).not.toBe('none');
		expect(container.querySelector('input[name="password"]')).toBeNull();
	});

	it('links the write-up template, or says there is not one yet', async () => {
		const { unmount } = render(SubmissionForm, { renderToken: TOKEN, template_url: TEMPLATE });
		const link = page.getByRole('link', { name: /write-up template/ });
		await expect.element(link).toHaveAttribute('href', TEMPLATE);
		await expect.element(link).toHaveAttribute('target', '_blank');
		expect(link.element().getAttribute('rel')).toContain('noopener');

		unmount();
		render(SubmissionForm, { renderToken: TOKEN, template_url: '' });
		await expect
			.element(page.getByText(/No official template has been published yet/))
			.toBeInTheDocument();
	});

	it('stops an empty submission locally, without a request', async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
		render(SubmissionForm, { renderToken: TOKEN, template_url: TEMPLATE });

		await submitButton().click();

		await expect.element(page.getByText('First name is required.')).toBeInTheDocument();
		await expect
			.element(page.getByText('Your Colby email address is required.'))
			.toBeInTheDocument();
		await expect.element(page.getByText(/Attach the \.docx/)).toBeInTheDocument();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('applies the email rule when the field is left, before any submit', async () => {
		render(SubmissionForm, { renderToken: TOKEN, template_url: TEMPLATE });
		const email = page.getByLabelText(/Colby email/);

		await email.fill('marie@gmail.com');
		email.element().blur();
		await expect.element(page.getByText(/Use your @colby\.edu address/)).toBeInTheDocument();

		await email.fill('marie.dubois@colby.edu');
		email.element().blur();
		await expect.element(page.getByText(/Use your @colby\.edu address/)).not.toBeInTheDocument();
	});

	it('keeps what someone typed while a validation message is appearing', async () => {
		render(SubmissionForm, { renderToken: TOKEN, template_url: TEMPLATE });
		const first = page.getByLabelText('First name');
		const last = page.getByLabelText('Last name');
		const email = page.getByLabelText(/Colby email/);

		await first.fill('Marie');
		await last.fill('Dubois');
		// Moving off the email field is what makes its message appear — and the re-render that follows
		// must not put anything back into the fields above it.
		await email.fill('marie@gmail.com');
		email.element().blur();

		await expect.element(page.getByText(/Use your @colby\.edu address/)).toBeInTheDocument();
		expect((first.element() as HTMLInputElement).value).toBe('Marie');
		expect((last.element() as HTMLInputElement).value).toBe('Dubois');
	});

	it('refuses a renamed text file the moment it is chosen', async () => {
		render(SubmissionForm, { renderToken: TOKEN, template_url: TEMPLATE });

		await chooseFile('notes.txt', 'text/plain');
		await expect.element(page.getByText(/has to be a \.docx file/)).toBeInTheDocument();

		await chooseFile('writeup.docx', DOCX);
		await expect.element(page.getByText(/has to be a \.docx file/)).not.toBeInTheDocument();
	});

	it('shows what the action said when the server rejected the submission', async () => {
		render(SubmissionForm, {
			renderToken: TOKEN,
			template_url: TEMPLATE,
			message: 'That document is too long for the site (412,300 characters; the cap is 200,000).',
			errors: { title: 'A title of at least 4 characters is required.' },
			values: {
				first_name: '',
				last_name: 'Dubois',
				email: 'marie.dubois@colby.edu',
				department: 'Computing Services',
				title: 'Auto-filling the faculty directory form',
				technologies: 'Python, Google Sheets',
				contributors: ''
			}
		});

		await expect
			.element(page.getByRole('alert'))
			.toHaveTextContent(/412,300 characters; the cap is 200,000/);
		// What the server flagged is on screen immediately, and what was typed is still there.
		await expect.element(page.getByText(/at least 4 characters/)).toBeInTheDocument();
		expect(value(/Title of the write-up/)).toBe('Auto-filling the faculty directory form');
	});

	it('says what to do when the rate limiter bounced the submission', async () => {
		render(SubmissionForm, { renderToken: TOKEN, template_url: TEMPLATE, waited: '4 minutes' });

		await expect.element(page.getByRole('alert')).toHaveTextContent(/Wait 4 minutes/);
	});
});

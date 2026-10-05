/**
 * The editor, in a browser.
 *
 * The rules about what may change (and what may not) are enforced on the API and tested there. What is
 * pinned here is the shape of the *controls*, because that is where the locked decisions live: a title
 * edit must not be able to move a URL, publishing must be a button of its own, and deleting must not
 * be one keystroke away.
 *
 * Run: npx vitest run src/lib/components/AdminProjectEditor.svelte.spec.ts
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from 'vitest-browser-svelte';
import AdminProjectEditor from './AdminProjectEditor.svelte';
import type { AdminDraft, AdminProjectDetail } from '#lib/types';

const PROJECT: AdminProjectDetail = {
	id: 42,
	slug: 'rubric-runner',
	title: 'Rubric Runner',
	department: 'Digital Learning Tools',
	technologies: ['Python', 'Docker'],
	contributors: ['A. Rivera', 'J. Okafor'],
	status: 'pending',
	created_at: '2026-02-02T04:00:00Z',
	updated_at: '2026-02-03T09:30:00Z',
	submitter: {
		id: 7,
		first_name: 'Ana',
		last_name: 'Rivera',
		departments: ['Digital Learning Tools'],
		email: 'a.rivera@colby.edu'
	},
	source_filename: 'rubric-runner.docx',
	source_path: '2026/02/rubric-runner.docx',
	body_markdown: '## Run it\n\n- docker compose up',
	body_html: '<h2>Run it</h2>\n<ul>\n<li>docker compose up</li>\n</ul>\n'
};

const DRAFT: AdminDraft = {
	title: 'Rubric Runner v2',
	department: 'Innovation & Digital Learning',
	technologies: 'Python, DuckDB',
	contributors: 'A. Rivera',
	body_markdown: '## Run it\n\n- uv run main.py'
};

function mount(props: Record<string, unknown> = {}) {
	const { container } = render(AdminProjectEditor, { project: PROJECT, ...props });
	return container;
}

/** The forms, keyed by the action they post to — the page's whole safety story is in that mapping. */
function forms(container: Element): Map<string, HTMLFormElement> {
	const found = new Map<string, HTMLFormElement>();
	for (const form of Array.from(container.querySelectorAll('form'))) {
		found.set(form.getAttribute('action') ?? '(none)', form);
	}
	return found;
}

const form = (container: Element, action: string) => forms(container).get(action);

function value(container: Element, name: string): string {
	const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
	return input?.value ?? '(missing)';
}

/** Text as a reader would see it: the template's own line breaks are not part of a sentence. */
function says(container: Element, wanted: RegExp): boolean {
	return wanted.test((container.textContent ?? '').replace(/\s+/g, ' '));
}

afterEach(() => {
	cleanup();
});

describe('what each form is allowed to change', () => {
	it('splits the page into save, status, slug and delete', () => {
		expect([...forms(mount()).keys()].sort()).toEqual(['?/delete', '?/save', '?/slug', '?/status']);
	});

	it('keeps the web address out of the form that edits everything else', () => {
		const container = mount();

		// Renaming is the common case; moving a URL must be a different request by construction, not a
		// different value in the same request.
		expect(form(container, '?/save')?.querySelector('input[name="slug"]')).toBeNull();
		expect(form(container, '?/save')?.querySelector('input[name="title"]')).not.toBeNull();
		expect(
			form(container, '?/save')?.querySelector('textarea[name="body_markdown"]')
		).not.toBeNull();

		expect(form(container, '?/slug')?.querySelector('input[name="slug"]')).not.toBeNull();
		expect(form(container, '?/slug')?.querySelector('input[name="title"]')).toBeNull();
	});

	it('says what changing the address does to links already out there', () => {
		expect(says(mount(), /anything already linked to the old address/i)).toBe(true);
	});
});

describe('the values in the boxes', () => {
	it('starts from what is stored, with the lists spelled as the API spelled them', () => {
		const container = mount();

		expect(value(container, 'title')).toBe('Rubric Runner');
		expect(value(container, 'department')).toBe('Digital Learning Tools');
		expect(value(container, 'technologies')).toBe('Python, Docker');
		expect(value(container, 'contributors')).toBe('A. Rivera, J. Okafor');
		expect(value(container, 'body_markdown')).toBe(PROJECT.body_markdown);
	});

	it('puts back exactly what was typed when an edit was refused', () => {
		const container = mount({ draft: DRAFT, message: 'Titles cannot be empty.' });

		expect(value(container, 'department')).toBe('Innovation & Digital Learning');
		expect(value(container, 'technologies')).toBe('Python, DuckDB');
		expect(value(container, 'body_markdown')).toBe(DRAFT.body_markdown);
		// The refusal is FastAPI's sentence about the field, not a generic "something went wrong".
		expect(says(container, /Titles cannot be empty\./)).toBe(true);
	});

	it('shows who sent it, where the file went and what the page is called', () => {
		const container = mount();

		expect(says(container, /a\.rivera@colby\.edu/)).toBe(true);
		expect(says(container, /rubric-runner\.docx/)).toBe(true);
		expect(says(container, /\/projects\/rubric-runner/)).toBe(true);

		// A mailto for the submitter, which is the whole reason admin gets to see the address at all.
		const mail = container.querySelector<HTMLAnchorElement>('a[href^="mailto:"]');
		expect(mail?.getAttribute('href')).toBe('mailto:a.rivera@colby.edu');
	});
});

describe('status', () => {
	it('makes publishing a button of its own, and greys out the state it is already in', () => {
		const buttons = Array.from(
			form(mount(), '?/status')?.querySelectorAll<HTMLButtonElement>('button[name="status"]') ?? []
		);

		// Three, and no 'approved' among them.
		expect(buttons.map((button) => button.value).sort()).toEqual([
			'pending',
			'published',
			'rejected'
		]);
		expect(buttons.find((button) => button.value === 'pending')?.disabled).toBe(true);
		expect(buttons.find((button) => button.value === 'published')?.disabled).toBe(false);
	});

	it('does not publish as a side effect of saving', () => {
		const container = mount();
		expect(form(container, '?/save')?.querySelector('[name="status"]')).toBeNull();
	});

	it('reports a status the API refused', () => {
		const container = mount({ statusMessage: 'That is not one of the three statuses.' });
		expect(says(container, /That is not one of the three statuses\./)).toBe(true);
	});
});

describe('delete', () => {
	it('cannot be done by accident: the box is required, and the copy says there is no undo', () => {
		const box = form(mount(), '?/delete')?.querySelector<HTMLInputElement>('input[name="confirm"]');

		expect(box?.getAttribute('required')).not.toBeNull();
		expect(box?.value).toBe('yes');
		expect(says(document.body, /no trash and no undo/i)).toBe(true);
		// Rejection exists and is pointed at as the alternative.
		expect(says(document.body, /reject it instead/i)).toBe(true);
	});

	it('carries the queue so the reviewer lands back where they came from', () => {
		expect(value(mount({ queue: 'rejected' }), 'queue')).toBe('rejected');
	});

	it('shows why a delete did not happen', () => {
		expect(says(mount({ deleteMessage: 'That write-up is already gone.' }), /already gone\./)).toBe(
			true
		);
	});
});

describe('preview', () => {
	it('is a button on the same form, so a draft can be read before it is saved', () => {
		const button = form(mount(), '?/save')?.querySelector<HTMLButtonElement>(
			'button[formaction="?/preview"]'
		);
		expect(button?.getAttribute('type')).toBe('submit');
	});

	it('renders the HTML the API returned', () => {
		const container = mount({ preview: PROJECT.body_html });
		expect(container.querySelector('.admin-preview .prose h2')?.textContent).toBe('Run it');
		expect(container.querySelectorAll('.admin-preview .prose li').length).toBe(1);
	});

	it('refuses a preview that is not sanitized markup, and says so', () => {
		const container = mount({ preview: '<h2>Run it</h2><img src=x onerror="alert(1)">' });

		// The guard inside ProjectBody is what makes it safe to have this on the page at all: a preview
		// is the one HTML that crosses the network without having come from a stored row.
		expect(container.querySelector('.admin-preview img')).toBeNull();
		expect(container.querySelector('.admin-preview .prose:not(pre)')).toBeNull();
		expect(says(container, /could not be displayed as formatted text/i)).toBe(true);
		// The draft it came from is still readable as source.
		expect(says(container, /docker compose up/)).toBe(true);
	});

	it('is absent until asked for', () => {
		expect(mount().querySelector('.admin-preview')).toBeNull();
	});
});

describe('news from the last write', () => {
	it('says what happened when the change went through', () => {
		expect(says(mount({ notice: 'Published — it is on Explore now.' }), /on Explore now\./)).toBe(
			true
		);
	});

	it('links a published write-up to the page everyone sees', () => {
		const container = mount({ project: { ...PROJECT, status: 'published' as const } });
		const link = container.querySelector<HTMLAnchorElement>('a[href="/projects/rubric-runner"]');
		expect(link?.textContent?.trim()).toBe('See it on Explore');
	});

	it('offers no such link while it is still pending', () => {
		expect(mount().querySelector('a[href="/projects/rubric-runner"]')).toBeNull();
	});
});

<script lang="ts">
	/**
	 * The Submit form. Progressive enhancement first: without JavaScript this is an ordinary
	 * multipart POST to `/submit` and everything still works — the server runs the same rules and
	 * re-renders with the field errors. JavaScript only adds live validation, an upload-in-progress
	 * state, and keeping the attached `.docx` between attempts.
	 *
	 * The text fields are bound to local state, seeded from whatever the server echoed back after a
	 * rejection, so the values being validated and the values on screen are the same copy. The uploaded
	 * file, the honeypot and the render token stay in the DOM: a file input cannot be bound, and
	 * nothing here has any business reading the other two.
	 */
	import { enhance, type SubmitFunction } from '$app/forms';
	import {
		DOCX_ACCEPT,
		HONEYPOT_FIELD,
		EMPTY_VALUES,
		MAX_DEPARTMENT_CHARS,
		MAX_NAME_CHARS,
		MAX_TITLE_CHARS,
		MAX_UPLOAD_MB,
		validateSubmission,
		type SubmissionDraft,
		type SubmissionErrors,
		type SubmissionFieldName,
		type SubmissionFormValues
	} from '#lib/validation';

	interface Props {
		/** Signed at render time; the action checks it for the minimum render→submit delay. */
		renderToken: string;
		/** Google Docs template link (locked decision #11); empty means none published yet. */
		template_url: string;
		/** Echoed back after a rejection so nobody retypes a form. */
		values?: SubmissionFormValues;
		errors?: SubmissionErrors;
		/** Form-level problem: an API rejection, a stale token, too many submissions. */
		message?: string | null;
		/** Set when the rate limiter bounced the submission before it reached the action. */
		waited?: string | null;
	}

	let {
		renderToken,
		template_url,
		values = undefined,
		errors = {},
		message = null,
		waited = null
	}: Props = $props();

	let form = $state<HTMLFormElement | null>(null);
	let visible = $state<SubmissionErrors>({});
	let busy = $state(false);
	let showAll = $state(false);
	const touched = $state<Partial<Record<SubmissionFieldName, boolean>>>({});
	/** The seven text inputs. The `<input>`s are `bind:value` to this and nothing else owns them. */
	const text = $state<SubmissionFormValues>({ ...EMPTY_VALUES });

	/**
	 * Whenever the server answers, that answer wins: put what it echoed back into the fields so nobody
	 * retypes a form, show exactly what it flagged, and stop hiding untouched fields now that a human
	 * has been through the whole thing. `$effect.pre` so all of it lands in the same render.
	 */
	$effect.pre(() => {
		if (values) {
			for (const field of Object.keys(EMPTY_VALUES) as (keyof SubmissionFormValues)[]) {
				text[field] = values[field] ?? '';
			}
		}
		const flagged = Object.keys(errors).length;
		if (flagged === 0 && !message) return;
		visible = { ...errors };
		showAll = flagged > 0;
	});

	const fields: SubmissionFieldName[] = [
		'first_name',
		'last_name',
		'email',
		'department',
		'title',
		'technologies',
		'contributors',
		'document'
	];

	/** The text fields live in `text`; a chosen file is the one thing only the DOM knows about. */
	function draft(): SubmissionDraft {
		const file = form ? new FormData(form).get('document') : null;
		return {
			...text,
			document: file instanceof File && file.size > 0 ? file : null
		};
	}

	/** Re-run the rules, showing only what the person has touched so far. */
	function revalidate() {
		const check = validateSubmission(draft());
		const next: SubmissionErrors = {};
		for (const [field, problem] of Object.entries(check.errors)) {
			if (showAll || touched[field as SubmissionFieldName]) {
				next[field as SubmissionFieldName] = problem;
			}
		}
		visible = next;
		return check;
	}

	const mark = (field: SubmissionFieldName) => () => {
		touched[field] = true;
		revalidate();
	};

	const validateThenSubmit: SubmitFunction = ({ cancel }) => {
		showAll = true;
		const check = revalidate();
		if (Object.keys(check.errors).length > 0) {
			cancel();
			const first = fields.find((field) => check.errors[field]);
			if (first && form) {
				form.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
			}
			return;
		}
		busy = true;
		// `update()` keeps enhance's default behaviour (reset on success, apply the action result).
		return async ({ update }) => {
			busy = false;
			await update();
		};
	};

	const describedBy = (field: SubmissionFieldName) => {
		const ids = [`hint-${field}`];
		if (visible[field]) ids.push(`error-${field}`);
		return ids.join(' ');
	};
</script>

<!-- `novalidate` on purpose: the browser's native tooltips ("Please fill out this field") would
     interrupt with different words than `#lib/validation` and the API use, and would fire before
     `use:enhance` sees the submit at all. The `required` attributes stay — they carry the meaning of
     the field for assistive technology, and the same rules are enforced in three places after that. -->
<form
	method="POST"
	novalidate
	enctype="multipart/form-data"
	class="submit-form"
	bind:this={form}
	use:enhance={validateThenSubmit}
>
	<input type="hidden" name="render_token" value={renderToken} />

	<!-- Honeypot (locked decision #7): off-screen rather than display:none, and unreachable by
	     keyboard. A human never sees it; a bot that fills it is rejected by both this app and the
	     API. The label text is a plausible-looking field a naive bot will happily complete. -->
	<div class="honeypot" aria-hidden="true">
		<label for={HONEYPOT_FIELD}>Company</label>
		<input
			id={HONEYPOT_FIELD}
			name={HONEYPOT_FIELD}
			type="text"
			tabindex="-1"
			autocomplete="off"
			maxlength="80"
		/>
	</div>

	{#if waited}
		<div class="notice notice--warning" role="alert">
			That network has submitted a few write-ups just now. Wait {waited} and try again — nothing was lost,
			the form is still here.
		</div>
	{:else if message}
		<div class="notice notice--warning" role="alert">{message}</div>
	{/if}

	<p class="hint submit-form__intro">
		One write-up per project. Write it up in a Google Doc, export it as `.docx`, and attach it below
		— the text becomes this page, so headings and lists are worth using.
		{#if template_url}
			<a href={template_url} target="_blank" rel="noopener noreferrer nofollow">
				Open the write-up template</a
			>.
		{:else}
			No official template has been published yet, so any Google Doc will do; ask
			<a href="mailto:help@colby.edu">Computing Services</a> if you would like one.
		{/if}
	</p>

	<div class="form-row">
		<div class="field">
			<label for="first_name">First name</label>
			<input
				id="first_name"
				name="first_name"
				type="text"
				autocomplete="given-name"
				maxlength={MAX_NAME_CHARS}
				required
				bind:value={text.first_name}
				onblur={mark('first_name')}
				aria-invalid={visible.first_name ? true : undefined}
				aria-describedby={describedBy('first_name')}
			/>
			<p class="hint" id="hint-first_name">Shown next to your write-up.</p>
			{#if visible.first_name}
				<p class="error" id="error-first_name">{visible.first_name}</p>
			{/if}
		</div>

		<div class="field">
			<label for="last_name">Last name</label>
			<input
				id="last_name"
				name="last_name"
				type="text"
				autocomplete="family-name"
				maxlength={MAX_NAME_CHARS}
				required
				bind:value={text.last_name}
				onblur={mark('last_name')}
				aria-invalid={visible.last_name ? true : undefined}
				aria-describedby={describedBy('last_name')}
			/>
			<p class="hint" id="hint-last_name">Shown next to your write-up.</p>
			{#if visible.last_name}
				<p class="error" id="error-last_name">{visible.last_name}</p>
			{/if}
		</div>
	</div>

	<div class="field">
		<label for="email">Colby email</label>
		<input
			id="email"
			name="email"
			type="email"
			inputmode="email"
			autocomplete="email"
			placeholder="you@colby.edu"
			required
			bind:value={text.email}
			onblur={mark('email')}
			aria-invalid={visible.email ? true : undefined}
			aria-describedby={describedBy('email')}
		/>
		<p class="hint" id="hint-email">
			Only <code>@colby.edu</code> addresses are accepted. It is never published — it is how an admin
			reaches you about the write-up.
		</p>
		{#if visible.email}
			<p class="error" id="error-email">{visible.email}</p>
		{/if}
	</div>

	<div class="field">
		<label for="department">Department or unit</label>
		<input
			id="department"
			name="department"
			type="text"
			maxlength={MAX_DEPARTMENT_CHARS}
			required
			bind:value={text.department}
			onblur={mark('department')}
			aria-invalid={visible.department ? true : undefined}
			aria-describedby={describedBy('department')}
		/>
		<p class="hint" id="hint-department">
			e.g. Environmental Studies, Computing Services, Admissions.
		</p>
		{#if visible.department}
			<p class="error" id="error-department">{visible.department}</p>
		{/if}
	</div>

	<div class="field">
		<label for="title">Title of the write-up</label>
		<input
			id="title"
			name="title"
			type="text"
			maxlength={MAX_TITLE_CHARS}
			placeholder="Grading 120 lab reports with a rubric macro"
			required
			bind:value={text.title}
			onblur={mark('title')}
			aria-invalid={visible.title ? true : undefined}
			aria-describedby={describedBy('title')}
		/>
		<p class="hint" id="hint-title">
			Say what it does, in the words you would use in the hallway — that is what people search.
		</p>
		{#if visible.title}
			<p class="error" id="error-title">{visible.title}</p>
		{/if}
	</div>

	<div class="field">
		<label for="technologies">Technologies</label>
		<input
			id="technologies"
			name="technologies"
			type="text"
			placeholder="Python, Google Sheets, Zapier"
			bind:value={text.technologies}
			onblur={mark('technologies')}
			aria-invalid={visible.technologies ? true : undefined}
			aria-describedby={describedBy('technologies')}
		/>
		<p class="hint" id="hint-technologies">
			Comma-separated. These are what Explore can be filtered by, so name the ones a colleague would
			search for.
		</p>
		{#if visible.technologies}
			<p class="error" id="error-technologies">{visible.technologies}</p>
		{/if}
	</div>

	<div class="field">
		<label for="contributors">Contributors <span class="hint">(optional)</span></label>
		<input
			id="contributors"
			name="contributors"
			type="text"
			placeholder="Karen Vreeland, Facilities IT"
			bind:value={text.contributors}
			onblur={mark('contributors')}
			aria-invalid={visible.contributors ? true : undefined}
			aria-describedby={describedBy('contributors')}
		/>
		<p class="hint" id="hint-contributors">
			Anyone else who should be credited, comma-separated. They are listed, not linked to an account
			— there are no accounts here.
		</p>
		{#if visible.contributors}
			<p class="error" id="error-contributors">{visible.contributors}</p>
		{/if}
	</div>

	<div class="field">
		<label for="document">The write-up (<code>.docx</code>)</label>
		<input
			id="document"
			name="document"
			type="file"
			accept={`${DOCX_ACCEPT},application/vnd.openxmlformats-officedocument.wordprocessingml.document`}
			required
			onchange={mark('document')}
			aria-invalid={visible.document ? true : undefined}
			aria-describedby={describedBy('document')}
		/>
		<p class="hint" id="hint-document">
			Up to {MAX_UPLOAD_MB} MB. In Google Docs: File → Download → Microsoft Word (.docx). Images are not
			published yet, so describe anything a screenshot would show.
		</p>
		{#if visible.document}
			<p class="error" id="error-document">{visible.document}</p>
		{/if}
	</div>

	<p class="submit-form__actions">
		<button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Submit for review'}</button>
		<span class="hint">Nothing is published until an admin reads it — usually a few days.</span>
	</p>
</form>

<style>
	.submit-form {
		max-width: 40rem;
	}

	.submit-form__intro {
		margin-bottom: 1.5rem;
	}

	.submit-form__actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.submit-form__actions .hint {
		margin: 0;
	}

	.form-row {
		display: grid;
		gap: 0 1rem;
		grid-template-columns: 1fr;
	}

	.honeypot {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	@media (min-width: 40rem) {
		.form-row {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>

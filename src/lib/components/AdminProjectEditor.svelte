<script lang="ts">
	import { enhance } from '$app/forms';
	import ProjectBody from '#lib/components/ProjectBody.svelte';
	import { authorName, formatDate } from '#lib/format';
	import type { AdminDraft, AdminProjectDetail, Status } from '#lib/types';

	interface Props {
		project: AdminProjectDetail;
		/** The green line after a successful write (`?notice=`). */
		notice?: string | null;
		/** Whatever an action handed back. `message` came from FastAPI and names the field. */
		message?: string | null;
		draft?: AdminDraft | null;
		slugMessage?: string | null;
		statusMessage?: string | null;
		deleteMessage?: string | null;
		/** Server-rendered HTML of the draft, from `?/preview`. Nothing else renders Markdown here. */
		preview?: string | null;
		/** The queue the admin came from, so a delete can put them back where they were. */
		queue?: string;
	}

	let {
		project,
		notice = null,
		message = null,
		draft = null,
		slugMessage = null,
		statusMessage = null,
		deleteMessage = null,
		preview = null,
		queue = 'pending'
	}: Props = $props();

	/**
	 * The draft if there is one, otherwise what is stored. A refused edit comes back as a draft so the
	 * admin is not asked to retype it; a fresh page load has none. Lists are one input each in the form
	 * and one array each in the database.
	 */
	const value = (field: keyof AdminDraft): string => {
		if (draft) return draft[field];
		const stored = project[field];
		return Array.isArray(stored) ? stored.join(', ') : String(stored);
	};

	/** Display order: the decision a pending write-up is waiting for comes first. */
	const choices: { status: Status; label: string; hint: string }[] = [
		{ status: 'published', label: 'Publish', hint: 'On Explore for everyone.' },
		{ status: 'rejected', label: 'Reject', hint: 'Kept, unpublished, visible to admin only.' },
		{ status: 'pending', label: 'Put back in the queue', hint: 'Not on Explore.' }
	];

	const address = $derived(`/projects/${project.slug}`);
</script>

<article class="admin-editor">
	<header class="admin-editor__head">
		<p class="admin-editor__back">
			<a href="/admin/dashboard?status={queue}">Back to the queue</a>
			<span class="admin-editor__num">#{project.id}</span>
		</p>
		<h1>{project.title}</h1>
		<p class="admin-editor__state">
			<span class="status status--{project.status}">{project.status}</span>
			{#if project.status === 'published'}
				<a href="/projects/{project.slug}" target="_blank" rel="noreferrer">See it on Explore</a>
			{/if}
		</p>
	</header>

	<!-- The rail: everything that is not the write-up itself. On desktop it sticks beside the form;
	     on a phone it folds into the column, decision first, because reading + deciding is the job
	     and typing is the exception. -->
	<aside class="admin-rail">
		<section class="admin-card admin-card--decide" aria-labelledby="status-heading">
			<h2 id="status-heading">Decide</h2>
			{#if statusMessage}
				<p class="notice notice--warning" role="alert">{statusMessage}</p>
			{/if}
			<form class="admin-decide" method="post" action="?/status" use:enhance>
				{#each choices as choice (choice.status)}
					<span class="admin-decide__choice">
						<button
							type="submit"
							name="status"
							value={choice.status}
							disabled={project.status === choice.status}
							class={choice.status === 'published' ? '' : 'button--quiet'}
						>
							{choice.label}
						</button>
						<span class="hint">{choice.hint}</span>
					</span>
				{/each}
			</form>
		</section>

		<section class="admin-card admin-card--facts" aria-labelledby="facts-heading">
			<h2 id="facts-heading">Sent by</h2>
			<dl class="admin-facts">
				<dt>Who</dt>
				<dd>
					{authorName(project.submitter)}
					<a href="mailto:{project.submitter.email}">{project.submitter.email}</a>
				</dd>
				<dt>Received</dt>
				<dd>{formatDate(project.created_at)}</dd>
				<dt>Last changed</dt>
				<dd>{formatDate(project.updated_at)}</dd>
				<dt>Original file</dt>
				<dd>{project.source_filename ?? 'none on record'}</dd>
			</dl>
		</section>

		<section class="admin-card admin-card--address" aria-labelledby="slug-heading">
			<h2 id="slug-heading">Web address</h2>
			{#if slugMessage}
				<p class="notice notice--warning" role="alert">{slugMessage}</p>
			{/if}
			<p class="hint">
				Currently <code>{address}</code>. This is the one field that does not follow the title: it
				changes only when you press the button, and anything already linked to the old address will
				stop working.
			</p>
			<form method="post" action="?/slug" use:enhance>
				<div class="field">
					<label for="slug">New address ending</label>
					<input
						id="slug"
						name="slug"
						maxlength="200"
						placeholder={project.slug}
						autocomplete="off"
					/>
				</div>
				<button type="submit" class="button--quiet">Change web address</button>
			</form>
		</section>

		<details class="admin-delete" open={deleteMessage !== null}>
			<summary>Delete this write-up</summary>
			<div class="admin-delete__body">
				{#if deleteMessage}
					<p class="notice notice--warning" role="alert">{deleteMessage}</p>
				{/if}
				<p class="hint">
					Removes the write-up, its place in the queue and the <code>.docx</code> it came from. There
					is no trash and no undo — if the write-up is merely wrong for now, reject it instead.
				</p>
				<form method="post" action="?/delete" use:enhance>
					<input type="hidden" name="queue" value={queue} />
					<div class="field field--check">
						<label for="confirm">
							<input id="confirm" name="confirm" type="checkbox" value="yes" required />
							Delete “{project.title}” and its original file
						</label>
					</div>
					<button type="submit" class="button--danger">Delete this write-up</button>
				</form>
			</div>
		</details>
	</aside>

	<div class="admin-editor__main">
		{#if notice}
			<p class="notice" role="status">{notice}</p>
		{/if}

		<form class="admin-form admin-card" method="post" action="?/save" use:enhance>
			{#if message}
				<p class="notice notice--warning" role="alert">{message}</p>
			{/if}

			<div class="field">
				<label for="title">Title</label>
				<input id="title" name="title" maxlength="200" required value={value('title')} />
				<span class="hint"
					>Renaming does not change the web address — that is a separate control.</span
				>
			</div>

			<div class="admin-meta-grid">
				<div class="field">
					<label for="department">Department or unit</label>
					<input
						id="department"
						name="department"
						maxlength="120"
						required
						value={value('department')}
					/>
				</div>

				<div class="field">
					<label for="technologies">Technologies</label>
					<input id="technologies" name="technologies" value={value('technologies')} />
					<span class="hint">Comma-separated, as they arrived.</span>
				</div>

				<div class="field">
					<label for="contributors">Contributors</label>
					<input id="contributors" name="contributors" value={value('contributors')} />
				</div>
			</div>

			<div class="field">
				<label for="body_markdown">Write-up (Markdown)</label>
				<textarea id="body_markdown" name="body_markdown" rows="16" value={value('body_markdown')}
				></textarea>
				<span class="hint">
					Heavier markup is stripped when it renders: no raw HTML, no images, no scripts. Links open
					in a new tab and are marked nofollow.
				</span>
			</div>

			<div class="admin-form__actions">
				<button type="submit">Save changes</button>
				<button type="submit" formaction="?/preview" class="button--quiet"
					>Preview this draft</button
				>
			</div>
		</form>

		{#if preview}
			<section class="admin-preview" aria-label="Draft preview">
				<h2>Preview</h2>
				<p class="hint">
					How the write-up will read on Explore, rendered from the text in the box above. Saving is
					what stores it.
				</p>
				<ProjectBody html={preview} markdown={value('body_markdown')} />
			</section>
		{/if}
	</div>
</article>

<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { api, type Options } from '$lib/api';

	const DESCRIPTION_TEMPLATE = `## The problem

What problem did this automation solve? Describe the tedious, repetitive, or error-prone work that prompted you to build it.

## Who benefits

Who would benefit from this automation? Share the roles, teams, or situations where it is most useful.

## How it works

Describe the automation itself and provide a tutorial or set of steps someone else could follow. Include any helpful context, lessons learned, or limitations.
`;

	let title = $state('');
	let description_markdown = $state(DESCRIPTION_TEMPLATE);
	let contributors = $state('');
	let tools = $state('');
	let department = $state('');
	let submitter_email = $state('');
	let message = $state('');
	let error = $state('');
	let pdfMessage = $state('');
	let imageMessage = $state('');
	let uploadingImages = $state(false);
	let parsingPdf = $state(false);
	let previewHtml = $state('');
	let previewing = $state(false);
	let previewRequest = 0;
	let previewTimer: ReturnType<typeof setTimeout> | undefined;
	let submitting = $state(false);
	let pdfInput = $state<HTMLInputElement>();
	let descriptionInput = $state<HTMLTextAreaElement>();
	let options = $state<Options>({ contributors: [], tools: [], departments: [] });
	let draftToken = $state(crypto.randomUUID().replace(/-/g, ''));

	function schedulePreview() {
		if (previewTimer) clearTimeout(previewTimer);
		previewTimer = setTimeout(updatePreview, 250);
	}

	async function updatePreview() {
		const requestId = ++previewRequest;
		if (!description_markdown.trim()) {
			previewHtml = '';
			previewing = false;
			return;
		}

		previewing = true;
		try {
			const result = await api<{ html: string }>('/api/markdown/preview', {
				method: 'POST',
				body: JSON.stringify({ source: description_markdown })
			});
			if (requestId === previewRequest) previewHtml = result.html;
		} catch {
			// The editor remains usable if a preview request fails.
		} finally {
			if (requestId === previewRequest) previewing = false;
		}
	}

	onMount(async () => {
		void updatePreview();
		try {
			options = await api<Options>('/api/options');
		} catch {
			// Suggestions are helpful but should not prevent free-form submission.
		}
	});

	async function importPdf(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		error = '';
		pdfMessage = '';
		parsingPdf = true;
		try {
			const formData = new FormData();
			formData.append('file', file);
			const result = await api<{ description_markdown: string }>('/api/markdown/from-pdf', {
				method: 'POST',
				body: formData
			});
			description_markdown = result.description_markdown;
			pdfMessage = 'Draft created. Review and edit it before submitting.';
			schedulePreview();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not create a draft from this PDF.';
		} finally {
			parsingPdf = false;
			input.value = '';
		}
	}

	async function uploadImages(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		if (!files.length) return;
		if (files.length > 10) {
			imageMessage = 'Choose no more than 10 images for one submission.';
			input.value = '';
			return;
		}
		uploadingImages = true;
		imageMessage = '';
		try {
			for (const file of files) {
				if (!/\.(png|jpg)$/i.test(file.name) || !['image/png', 'image/jpeg'].includes(file.type)) {
					throw new Error('Images must be PNG or JPG files.');
				}
				if (file.size > 5 * 1024 * 1024) throw new Error('Images must be 5 MB or smaller.');
				const formData = new FormData();
				formData.append('file', file);
				const result = await api<{ markdown: string }>(`/api/uploads?draft_token=${draftToken}`, {
					method: 'POST',
					body: formData
				});
				const start = descriptionInput?.selectionStart ?? description_markdown.length;
				const end = descriptionInput?.selectionEnd ?? start;
				description_markdown = `${description_markdown.slice(0, start)}${result.markdown}\n\n${description_markdown.slice(end)}`;
			}
			imageMessage = `${files.length} image${files.length === 1 ? '' : 's'} added to the draft.`;
			schedulePreview();
		} catch (err) {
			imageMessage = err instanceof Error ? err.message : 'Could not upload images.';
		} finally {
			uploadingImages = false;
			input.value = '';
		}
	}

	async function submit() {
		error = '';
		message = '';
		submitting = true;
		try {
			await api('/api/projects', {
				method: 'POST',
				body: JSON.stringify({
					title,
					description_markdown,
					contributors: contributors
						.split(',')
						.map((value) => value.trim())
						.filter(Boolean),
					tools: tools
						.split(',')
						.map((value) => value.trim())
						.filter(Boolean),
					department,
					submitter_email,
					draft_token: draftToken
				})
			});
			sessionStorage.setItem('automation-showcase-submission-notice', 'true');
			await goto('/');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not submit the project.';
		} finally {
			submitting = false;
		}
	}

	onDestroy(() => {
		if (previewTimer) clearTimeout(previewTimer);
	});
</script>

<svelte:head><title>Submit · Colby Automation Showcase</title></svelte:head>

<div class="page-header">
	<p class="meta">OPEN INVITATION</p>
	<h1>Show us what you built.</h1>
	<p class="muted form-intro">
		Share a practical automation project with Colby colleagues. An administrator will review it
		before it appears in Explore.
	</p>
</div>

{#if message}<p class="success">{message}</p>{/if}
{#if error}<p class="error">{error}</p>{/if}

<form
	onsubmit={(event) => {
		event.preventDefault();
		submit();
	}}
>
	<div class="field">
		<label for="title">Project title</label>
		<input id="title" bind:value={title} required />
	</div>

	<div class="field">
		<label for="description">Project story</label>
		<div class="description-guidance">
			<p class="meta">A helpful story answers three questions</p>
			<p>
				What problem did this solve? Who benefits from it? How does it work, and how could someone
				else follow the tutorial?
			</p>
			<p class="helper">
				These are suggestions, not separate required fields. Write naturally, and edit or remove the
				starter outline below as needed.
			</p>
		</div>
		<div class="pdf-import">
			<label for="pdf-upload">Start from a PDF (optional)</label>
			<input
				id="pdf-upload"
				bind:this={pdfInput}
				type="file"
				accept=".pdf,application/pdf"
				onchange={importPdf}
				disabled={parsingPdf}
				aria-describedby="pdf-helper"
			/>
			<span id="pdf-helper" class="helper"
				>Upload one PDF up to 10 MB. We’ll extract its text and basic formatting into an editable
				draft; the original file is not saved.</span
			>
			{#if pdfMessage}<p class="success pdf-status">{pdfMessage}</p>{/if}
		</div>
		<div class="image-import">
			<label for="image-upload">Add images (optional)</label>
			<input
				id="image-upload"
				type="file"
				accept=".png,.jpg,image/png,image/jpeg"
				multiple
				onchange={uploadImages}
				disabled={uploadingImages}
			/>
			<span class="helper"
				>PNG or JPG only, up to 10 images and 5 MB each. Images are inserted into your Markdown
				draft.</span
			>
			{#if imageMessage}<p class={imageMessage.includes('added') ? 'success' : 'error'}>
					{imageMessage}
				</p>{/if}
		</div>
		<div class="actions template-actions" aria-label="Description template actions">
			<button
				class="secondary"
				type="button"
				onclick={() => {
					description_markdown = DESCRIPTION_TEMPLATE;
					schedulePreview();
				}}>Use suggested outline</button
			>
			<button
				class="secondary"
				type="button"
				onclick={() => {
					description_markdown = '';
					schedulePreview();
				}}>Start with a blank page</button
			>
		</div>
		<textarea
			id="description"
			bind:this={descriptionInput}
			bind:value={description_markdown}
			oninput={schedulePreview}
			required
			aria-describedby="description-helper"></textarea>
		<span id="description-helper" class="helper"
			>Markdown is supported for headings, links, and images. The text you submit will remain
			editable by an administrator.</span
		>
		<section
			class="markdown-live-preview"
			aria-live="polite"
			aria-label="Rendered project story preview"
		>
			<div class="preview-heading">
				<span class="meta">Live preview</span>
				{#if previewing}<span class="helper">Updating…</span>{/if}
			</div>
			{#if previewHtml}
				<div class="rendered">{@html previewHtml}</div>
			{:else}
				<p class="preview-empty">Your formatted project story will appear here as you write.</p>
			{/if}
		</section>
	</div>

	<div class="field">
		<label for="contributors">Contributors</label>
		<input
			id="contributors"
			list="contributors-list"
			bind:value={contributors}
			required
			placeholder="Name One, Name Two"
		/>
		<span class="helper">Separate multiple names with commas.</span>
	</div>
	<datalist id="contributors-list"
		>{#each options.contributors as contributor}<option value={contributor}
			></option>{/each}</datalist
	>

	<div class="field">
		<label for="tools">Tools used</label>
		<input
			id="tools"
			list="tools-list"
			bind:value={tools}
			required
			placeholder="ChatGPT, Google Sheets"
		/>
	</div>
	<datalist id="tools-list"
		>{#each options.tools as tool}<option value={tool}></option>{/each}</datalist
	>

	<div class="field">
		<label for="department">Department</label>
		<input id="department" list="departments-list" bind:value={department} required />
	</div>
	<datalist id="departments-list"
		>{#each options.departments as departmentOption}<option value={departmentOption}
			></option>{/each}</datalist
	>

	<div class="field">
		<label for="email">Staff email</label>
		<input
			id="email"
			type="email"
			pattern="[A-Za-z]+@colby\.edu"
			bind:value={submitter_email}
			required
			placeholder="name@colby.edu"
		/>
		<span class="helper">Use your Colby staff email, for example name@colby.edu.</span>
	</div>

	<button disabled={submitting}>{submitting ? 'Submitting…' : 'Submit project'}</button>
</form>

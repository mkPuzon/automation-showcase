<script lang="ts">
	import { onMount } from 'svelte';
	import { api, type Options } from '$lib/api';

	let title = $state('');
	let description_markdown = $state('');
	let contributors = $state('');
	let tools = $state('');
	let department = $state('');
	let submitter_email = $state('');
	let message = $state('');
	let error = $state('');
	let submitting = $state(false);
	let options = $state<Options>({ contributors: [], tools: [], departments: [] });

	onMount(async () => {
		try {
			options = await api<Options>('/api/options');
		} catch {
			// Suggestions are helpful but should not prevent free-form submission.
		}
	});

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
					contributors: contributors.split(',').map((value) => value.trim()).filter(Boolean),
					tools: tools.split(',').map((value) => value.trim()).filter(Boolean),
					department,
					submitter_email
				})
			});
			message = 'Thanks! Your project was submitted for review.';
			title = description_markdown = contributors = tools = department = submitter_email = '';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not submit the project.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head><title>Submit · Colby Automation Showcase</title></svelte:head>

<div class="page-header">
	<p class="meta">OPEN INVITATION</p>
	<h1>Show us what you built.</h1>
	<p class="muted form-intro">Share a practical automation project with Colby colleagues. An administrator will review it before it appears in Explore.</p>
</div>

{#if message}<p class="success">{message}</p>{/if}
{#if error}<p class="error">{error}</p>{/if}

<form onsubmit={(event) => { event.preventDefault(); submit(); }}>
	<div class="field">
		<label for="title">Project title</label>
		<input id="title" bind:value={title} required />
	</div>

	<div class="field">
		<label for="description">Description (Markdown)</label>
		<textarea id="description" bind:value={description_markdown} required placeholder="Explain what the project does, how it works, and what you learned."></textarea>
		<span class="helper">Markdown is supported for headings, links, and images.</span>
	</div>

	<div class="field">
		<label for="contributors">Contributors</label>
		<input id="contributors" list="contributors-list" bind:value={contributors} required placeholder="Name One, Name Two" />
		<span class="helper">Separate multiple names with commas.</span>
	</div>
	<datalist id="contributors-list">{#each options.contributors as contributor}<option value={contributor}></option>{/each}</datalist>

	<div class="field">
		<label for="tools">Tools used</label>
		<input id="tools" list="tools-list" bind:value={tools} required placeholder="ChatGPT, Google Sheets" />
	</div>
	<datalist id="tools-list">{#each options.tools as tool}<option value={tool}></option>{/each}</datalist>

	<div class="field">
		<label for="department">Department</label>
		<input id="department" list="departments-list" bind:value={department} required />
	</div>
	<datalist id="departments-list">{#each options.departments as departmentOption}<option value={departmentOption}></option>{/each}</datalist>

	<div class="field">
		<label for="email">Staff email</label>
		<input id="email" type="email" pattern="[A-Za-z]+@colby\.edu" bind:value={submitter_email} required placeholder="name@colby.edu" />
		<span class="helper">Use your Colby staff email, for example name@colby.edu.</span>
	</div>

	<button disabled={submitting}>{submitting ? 'Submitting…' : 'Submit project'}</button>
</form>

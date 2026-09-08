<script lang="ts">
	import { api } from '$lib/api';

	let title = $state('');
	let description_markdown = $state('');
	let contributors = $state('');
	let tools = $state('');
	let department = $state('');
	let submitter_email = $state('');
	let message = $state('');
	let error = $state('');
	let submitting = $state(false);

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

<h1>Submit a project</h1>
<p class="muted">Share a project for an admin to review. Separate multiple contributors or tools with commas.</p>

{#if message}<p class="success">{message}</p>{/if}
{#if error}<p class="error">{error}</p>{/if}

<form onsubmit={(event) => { event.preventDefault(); submit(); }}>
	<label for="title">Project title</label>
	<input id="title" bind:value={title} required />

	<label for="description">Description (Markdown)</label>
	<textarea id="description" bind:value={description_markdown} required placeholder="Explain what the project does, how it works, and what you learned."></textarea>

	<label for="contributors">Contributors</label>
	<input id="contributors" bind:value={contributors} required placeholder="Name One, Name Two" />

	<label for="tools">Tools used</label>
	<input id="tools" bind:value={tools} required placeholder="ChatGPT, Google Sheets" />

	<label for="department">Department</label>
	<input id="department" bind:value={department} required />

	<label for="email">Staff email</label>
	<input id="email" type="email" pattern="[A-Za-z]+@colby\.edu" bind:value={submitter_email} required placeholder="name@colby.edu" />

	<button disabled={submitting}>{submitting ? 'Submitting…' : 'Submit project'}</button>
</form>

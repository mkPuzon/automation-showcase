<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { api, type Project } from '$lib/api';

	let project = $state<Project | null>(null);
	let loading = $state(true);
	let error = $state('');

	onMount(async () => {
		try {
			project = await api<Project>(`/api/projects/${page.params.slug}`);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not load project.';
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head><title>Project · Colby Automation Showcase</title></svelte:head>

{#if loading}
	<p>Loading project…</p>
{:else if error}
	<p class="error">{error}</p>
{:else if project}
	<p><a href="/">← Back to explore</a></p>
	<h1>{project.title}</h1>
	<p class="meta">{project.department} · Submitted by {project.submitter_email} · {project.contributors.join(', ')}</p>
	<h2>Tools used</h2>
	<ul class="tags">{#each project.tools as tool}<li class="tag">{tool}</li>{/each}</ul>
	<h2>Description</h2>
	<div class="markdown rendered">{@html project.description_html}</div>
{/if}

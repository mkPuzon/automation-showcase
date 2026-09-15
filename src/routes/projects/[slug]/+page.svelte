<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { api, type Project } from '$lib/api';

	let project = $state<Project | null>(null);
	let loading = $state(true);
	let error = $state('');

	function toolClass(tool: string) {
		const name = tool.toLowerCase();
		if (/sheet|excel|tableau|power bi|sql|python|data|analytics|database/.test(name)) return 'tag--data';
		if (/zapier|make|power automate|automation|workflow|form|slack|notion/.test(name)) return 'tag--workflow';
		return '';
	}

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
	<a class="back-link" href="/">← Back to explore</a>
	<p class="meta">{project.department}</p>
	<h1>{project.title}</h1>
	<p class="meta">Submitted by {project.submitter_email} · {project.contributors.join(', ')}</p>
	<h2>Tools used</h2>
	<ul class="tags">{#each project.tools as tool}<li class={`tag ${toolClass(tool)}`}>{tool}</li>{/each}</ul>
	<div class="markdown rendered">{@html project.description_html}</div>
{/if}

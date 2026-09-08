<script lang="ts">
	import { onMount } from 'svelte';
	import { api, type Project } from '$lib/api';

	let projects = $state<Project[]>([]);
	let loading = $state(true);
	let error = $state('');

	onMount(async () => {
		try {
			projects = await api<Project[]>('/api/projects');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not load projects.';
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head><title>Explore · Colby Automation Showcase</title></svelte:head>

<h1>Explore projects</h1>
<p class="muted">Approved automation projects shared by Colby staff and faculty.</p>

{#if loading}
	<p>Loading projects…</p>
{:else if error}
	<p class="error">{error}</p>
{:else if projects.length === 0}
	<p class="card">No projects have been approved yet.</p>
{:else}
	<div class="grid">
		{#each projects as project}
			<article class="card">
				<h2><a href={`/projects/${project.detail_slug}`}>{project.title}</a></h2>
				<p>{project.description_markdown.slice(0, 180)}{project.description_markdown.length > 180 ? '…' : ''}</p>
				<p class="meta">{project.department} · {project.contributors.join(', ')}</p>
				<ul class="tags">
					{#each project.tools as tool}<li class="tag">{tool}</li>{/each}
				</ul>
			</article>
		{/each}
	</div>
{/if}

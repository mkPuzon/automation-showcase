<script lang="ts">
	import ProjectBrowser from '#lib/components/ProjectBrowser.svelte';
	import type { PageData } from './$types';

	let { data } = $props() satisfies PageData;
</script>

<h1>Explore</h1>
<p class="lede">
	Automations, tools, and tips Colby staff and faculty use to get their week back. Everything here
	was written up by a colleague and reviewed before it was published.
</p>

{#if data.problem}
	<div class="notice" role="alert">{data.problem}</div>
{:else}
	<p class="meta">
		{data.projects.length} published project{data.projects.length === 1 ? '' : 's'}.
	</p>
	<ProjectBrowser projects={data.projects} />
{/if}

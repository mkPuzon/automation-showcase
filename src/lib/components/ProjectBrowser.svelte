<script lang="ts">
	import ProjectCard from '#lib/components/ProjectCard.svelte';
	import ProjectFilters from '#lib/components/ProjectFilters.svelte';
	import {
		authorOptions,
		departmentOptions,
		EMPTY_FILTERS,
		filterProjects,
		technologyOptions,
		type ProjectFilterState
	} from '#lib/filters';
	import type { ProjectSummary } from '#lib/types';

	let { projects }: { projects: ProjectSummary[] } = $props();

	let filters = $state<ProjectFilterState>({ ...EMPTY_FILTERS });

	// Everything below recomputes in the browser; the metadata arrived with the page.
	const visible = $derived(filterProjects(projects, filters));
	const technologies = $derived(technologyOptions(projects));
	const departments = $derived(departmentOptions(projects));
	const authors = $derived(authorOptions(projects));

	const reset = () => (filters = { ...EMPTY_FILTERS });
</script>

{#if projects.length === 0}
	<p class="empty">
		Nothing is published yet. <a href="/submit">Submit a write-up</a> and it will show up here once an
		admin publishes it.
	</p>
{:else}
	<ProjectFilters
		{filters}
		{technologies}
		{departments}
		{authors}
		resultCount={visible.length}
		total={projects.length}
		onchange={(next) => (filters = next)}
		onreset={reset}
	/>

	{#if visible.length > 0}
		<div class="card-grid">
			{#each visible as project, i (project.id)}
				<ProjectCard {project} number={i + 1} />
			{/each}
		</div>
	{:else}
		<p class="empty">
			No published project matches those filters.
			<button type="button" class="button--quiet" onclick={reset}>Clear filters</button>
		</p>
	{/if}
{/if}

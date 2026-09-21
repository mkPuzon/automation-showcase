<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { api, type Project } from '$lib/api';

	let projects = $state<Project[]>([]);
	let loading = $state(true);
	let error = $state('');
	let searchQuery = $state('');
	let toolFilter = $state('');
	let showSubmissionNotice = $state(false);

	let toolOptions = $derived(
		[...new Set(projects.flatMap((project) => project.tools))].sort((a, b) => a.localeCompare(b))
	);
	let filteredProjects = $derived.by(() => {
		const search = searchQuery.trim().toLocaleLowerCase();
		const toolSearch = toolFilter.trim().toLocaleLowerCase();

		return projects.filter((project) => {
			const matchesSearch =
				!search ||
				project.title.toLocaleLowerCase().includes(search) ||
				project.contributors.some((contributor) =>
					contributor.toLocaleLowerCase().includes(search)
				);
			const matchesToolSearch =
				!toolSearch || project.tools.some((tool) => tool.toLocaleLowerCase().includes(toolSearch));
			return matchesSearch && matchesToolSearch;
		});
	});

	function clearFilters() {
		searchQuery = '';
		toolFilter = '';
	}

	function closeSubmissionNotice() {
		showSubmissionNotice = false;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && showSubmissionNotice) closeSubmissionNotice();
	}

	function toolClass(tool: string) {
		const name = tool.toLowerCase();
		if (/sheet|excel|tableau|power bi|sql|python|data|analytics|database/.test(name))
			return 'tag--data';
		if (/zapier|make|power automate|automation|workflow|form|slack|notion/.test(name))
			return 'tag--workflow';
		return '';
	}

	onMount(async () => {
		if (sessionStorage.getItem('automation-showcase-submission-notice') === 'true') {
			sessionStorage.removeItem('automation-showcase-submission-notice');
			showSubmissionNotice = true;
		}

		try {
			projects = await api<Project[]>('/api/projects');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not load projects.';
		} finally {
			loading = false;
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head><title>Explore · Colby Automation Showcase</title></svelte:head>

{#if showSubmissionNotice}
	<div
		class="notice-backdrop"
		role="presentation"
		onclick={(event) => event.target === event.currentTarget && closeSubmissionNotice()}
	>
		<div
			class="notice-dialog"
			role="dialog"
			tabindex="-1"
			aria-modal="true"
			aria-labelledby="submission-notice-title"
		>
			<p class="meta">SUBMISSION RECEIVED</p>
			<h2 id="submission-notice-title">Your project is being reviewed.</h2>
			<p>
				Thanks for sharing your work with the Colby community. We’ll review your project before it
				appears in the showcase.
			</p>
			<p>
				If you haven’t recently spoken with us about it, reach out to <a
					href="mailto:davisai@colby.edu">davisai@colby.edu</a
				> for updates on its status.
			</p>
			<button type="button" onclick={closeSubmissionNotice}>Got it</button>
		</div>
	</div>
{/if}

<div class="explore-header">
	<div>
		<p class="meta">COLBY STAFF & FACULTY</p>
		<h1>Automation Showcase</h1>
		<p class="muted">
			Wondering how your colleagues are using automation technology in their offices and classrooms?
			Explore below to see what the Colby community has created to give them back more time to focus
			on what matters.
		</p>
	</div>
	<a class="button" href={resolve('/submit')}>Share a project</a>
</div>

<div class="explore-filters" aria-label="Search and filter projects">
	<div class="filter-field filter-field--search">
		<label for="project-search">Search projects</label>
		<input
			id="project-search"
			type="search"
			bind:value={searchQuery}
			placeholder="Search by title or contributor"
		/>
	</div>
	<div class="filter-field">
		<label for="tool-filter">Filter by tool</label>
		<input
			id="tool-filter"
			type="search"
			bind:value={toolFilter}
			list="available-tools"
			placeholder="Type or choose a tool"
		/>
		<datalist id="available-tools">
			{#each toolOptions as tool (tool)}
				<option value={tool}></option>
			{/each}
		</datalist>
	</div>
	{#if searchQuery || toolFilter}
		<button class="secondary filter-clear" type="button" onclick={clearFilters}
			>Clear filters</button
		>
	{/if}
</div>

{#if loading}
	<div class="grid" aria-label="Loading projects">
		<div class="card"><p class="muted">Loading projects…</p></div>
		<div class="card"><p class="muted">Loading projects…</p></div>
	</div>
{:else if error}
	<p class="error">{error}</p>
{:else if projects.length === 0}
	<p class="card">No projects have been approved yet.</p>
{:else if filteredProjects.length === 0}
	<div class="card empty-results">
		<h2>No matching projects</h2>
		<p class="muted">Try a different title, contributor, or tool.</p>
		<button class="secondary" type="button" onclick={clearFilters}>Clear filters</button>
	</div>
{:else}
	<p class="results-count" aria-live="polite">
		Showing {filteredProjects.length} of {projects.length}
		{projects.length === 1 ? 'project' : 'projects'}
	</p>
	<div class="grid">
		{#each filteredProjects as project (project.id)}
			<article class="card">
				<p class="meta">{project.department}</p>
				<h2><a href={resolve(`/projects/${project.detail_slug}`)}>{project.title}</a></h2>
				<p>
					{project.description_markdown.slice(0, 180)}{project.description_markdown.length > 180
						? '…'
						: ''}
				</p>
				<p class="meta">By {project.contributors.join(', ')}</p>
				<ul class="tags">
					{#each project.tools as tool (tool)}
						<li class={`tag ${toolClass(tool)}`}>{tool}</li>
					{/each}
				</ul>
			</article>
		{/each}
	</div>
{/if}

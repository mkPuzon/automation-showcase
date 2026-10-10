<script lang="ts">
	import type { ProjectFilterState } from '#lib/filters';
	import { filtersActive } from '#lib/filters';

	interface Props {
		filters: ProjectFilterState;
		technologies: string[];
		departments: string[];
		authors: string[];
		resultCount: number;
		total: number;
		onchange: (next: ProjectFilterState) => void;
		onreset: () => void;
	}

	let {
		filters,
		technologies,
		departments,
		authors,
		resultCount,
		total,
		onchange,
		onreset
	}: Props = $props();

	const patch = (changes: Partial<ProjectFilterState>) => onchange({ ...filters, ...changes });
	const active = $derived(filtersActive(filters));
</script>

<section class="filters" aria-label="Filter projects">
	<div class="filters__field filters__field--search">
		<label for="filter-title">Search titles</label>
		<input
			id="filter-title"
			type="search"
			placeholder="e.g. rubric, directory, sensor"
			value={filters.q}
			oninput={(event) => patch({ q: event.currentTarget.value })}
		/>
	</div>

	<div class="filters__field">
		<label for="filter-technology">Technology</label>
		<select
			id="filter-technology"
			value={filters.technology}
			onchange={(event) => patch({ technology: event.currentTarget.value })}
		>
			<option value="">All technologies</option>
			{#each technologies as technology (technology)}
				<option value={technology}>{technology}</option>
			{/each}
		</select>
	</div>

	<div class="filters__field">
		<label for="filter-department">Department</label>
		<select
			id="filter-department"
			value={filters.department}
			onchange={(event) => patch({ department: event.currentTarget.value })}
		>
			<option value="">All departments</option>
			{#each departments as department (department)}
				<option value={department}>{department}</option>
			{/each}
		</select>
	</div>

	<div class="filters__field">
		<label for="filter-author">Author</label>
		<select
			id="filter-author"
			value={filters.author}
			onchange={(event) => patch({ author: event.currentTarget.value })}
		>
			<option value="">All authors</option>
			{#each authors as author (author)}
				<option value={author}>{author}</option>
			{/each}
		</select>
	</div>

	{#if active}
		<button type="button" class="button--quiet filters__clear" onclick={onreset}>Clear</button>
	{/if}

	<p class="results-count" role="status">
		{resultCount} of {total} project{total === 1 ? '' : 's'}
	</p>
</section>

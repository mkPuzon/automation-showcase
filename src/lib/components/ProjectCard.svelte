<script lang="ts">
	import { authorName, formatDate } from '#lib/format';
	import type { ProjectSummary } from '#lib/types';

	let { project, number }: { project: ProjectSummary; number?: number } = $props();

	// A plate is numbered by its place in the current shelf, so the numbers
	// re-register as filters narrow the grid — the grid answers a filter change
	// visibly, not with a silent swap.
	const plate = $derived(number === undefined ? null : `Plate ${String(number).padStart(2, '0')}`);
</script>

<article class="card project-card">
	{#if plate}
		<p class="project-card__no">{plate}</p>
	{/if}

	<h3 class="project-card__title">
		<a href="/projects/{project.slug}">{project.title}</a>
	</h3>

	<p class="meta">
		<b>{authorName(project.submitter)}</b> · {project.department}
	</p>

	{#if project.technologies.length > 0}
		<ul class="tag-list" aria-label="Technologies used by {project.title}">
			{#each project.technologies as technology, i (`${technology}-${i}`)}
				<li class="tag">{technology}</li>
			{/each}
		</ul>
	{/if}

	<p class="meta project-card__date">
		Posted <time datetime={project.created_at}>{formatDate(project.created_at)}</time>
	</p>
</article>

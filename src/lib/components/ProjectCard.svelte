<script lang="ts">
	import { authorName, formatDate } from '#lib/format';
	import type { ProjectSummary } from '#lib/types';

	let { project, number }: { project: ProjectSummary; number?: number } = $props();

	// The shelf settles in card by card: a card's place in the current grid sets
	// its slice of the entrance stagger, so a filter change visibly re-deals the
	// new arrivals instead of swapping them in silently.
	const index = $derived(number === undefined ? 0 : number - 1);
</script>

<!-- the tabbed folder: the department rides a triad-tinted tab above the face -->
<article class="card project-card pc-folder" style="--card-i: {index}">
	<p class="folder-tab">{project.department}</p>
	<div class="folder-face">
		<h3 class="project-card__title">
			<a href="/projects/{project.slug}">{project.title}</a>
		</h3>

		<p class="meta">
			<b>{authorName(project.submitter)}</b>
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
	</div>
</article>

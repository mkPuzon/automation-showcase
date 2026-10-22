<script lang="ts">
	import ProjectBody from '#lib/components/ProjectBody.svelte';
	import { authorName, formatDate } from '#lib/format';
	import type { PageData } from './$types';

	let { data } = $props() satisfies PageData;
	let { project } = $derived(data);
</script>

<svelte:head>
	<title>{project.title} · Colby Tech Share</title>
</svelte:head>

<p class="breadcrumbs"><a href="/">&larr; All projects</a></p>

<article class="project">
	<header class="project__header">
		<h1>{project.title}</h1>

		<dl class="project__meta">
			<div>
				<dt>Written by</dt>
				<dd>{authorName(project.submitter)}</dd>
			</div>
			<div>
				<dt>Department</dt>
				<dd>{project.department}</dd>
			</div>
			<div>
				<dt>Posted</dt>
				<dd>
					<time datetime={project.created_at}>{formatDate(project.created_at)}</time>
				</dd>
			</div>
			{#if project.contributors.length > 0}
				<div>
					<dt>With thanks to</dt>
					<dd>{project.contributors.join(', ')}</dd>
				</div>
			{/if}
			{#if project.technologies.length > 0}
				<div>
					<dt>Uses</dt>
					<dd>
						<ul class="tag-list">
							{#each project.technologies as technology, i (`${technology}-${i}`)}
								<li class="tag">{technology}</li>
							{/each}
						</ul>
					</dd>
				</div>
			{/if}
		</dl>
	</header>

	<ProjectBody html={project.body_html} markdown={project.body_markdown} />

</article>

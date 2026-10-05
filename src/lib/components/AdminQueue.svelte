<script lang="ts">
	import { authorName, formatDate } from '#lib/format';
	import type { AdminProjectSummary } from '#lib/types';

	let { projects }: { projects: AdminProjectSummary[] } = $props();

	/** Rows share their shape but not their news: a pending row offers a first read, a published one
	 *  offers the page it is live on. */
	const labels: Record<string, string> = {
		pending: 'waiting to be read',
		published: 'live on Explore',
		rejected: 'not being published'
	};
</script>

{#if projects.length === 0}
	<p class="empty">Nothing here.</p>
{:else}
	<div class="admin-queue-scroll">
		<table class="admin-queue">
			<thead>
				<tr>
					<th scope="col">Write-up</th>
					<th scope="col">Who sent it</th>
					<th scope="col">Unit</th>
					<th scope="col">Received</th>
					<th scope="col">Touched</th>
					<th scope="col"><span class="sr-only">Open</span></th>
				</tr>
			</thead>
			<tbody>
				{#each projects as project (project.id)}
					<tr>
						<th scope="row">
							<a href="/admin/dashboard/{project.id}">{project.title}</a>
							<span class="status status--{project.status}">{project.status}</span>
							<span class="admin-queue__file">
								{#if project.source_filename}
									{project.source_filename}
								{:else}
									no original file
								{/if}
							</span>
						</th>
						<td>
							{authorName(project.submitter)}
							<a class="admin-queue__email" href="mailto:{project.submitter.email}">
								{project.submitter.email}
							</a>
						</td>
						<td>{project.department}</td>
						<td>{formatDate(project.created_at)}</td>
						<td>{formatDate(project.updated_at)}</td>
						<td>
							<a class="button button--quiet" href="/admin/dashboard/{project.id}">Open</a>
							{#if project.status === 'published'}
								<a
									class="admin-queue__public"
									href="/projects/{project.slug}"
									target="_blank"
									rel="noreferrer">View live</a
								>
							{/if}
							<span class="hint">{labels[project.status]}</span>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

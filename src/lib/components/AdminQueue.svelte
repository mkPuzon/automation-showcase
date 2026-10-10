<script lang="ts">
	import { authorName, formatDate } from '#lib/format';
	import type { AdminProjectSummary } from '#lib/types';

	let { projects, q = '' }: { projects: AdminProjectSummary[]; q?: string } = $props();

	/** Whole days since it arrived — the queue's only clock, and the reason a reviewer can triage
	 *  without doing date arithmetic in their head. */
	function waitingLabel(iso: string): string {
		const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
		if (days <= 0) return 'arrived today';
		return days === 1 ? 'waiting 1 day' : `waiting ${days} days`;
	}
</script>

{#if projects.length === 0}
	<p class="empty">
		{#if q}
			Nothing matches “{q}”. Try fewer words, or <a href="?status=all">clear the search</a>.
		{:else}
			Nothing here.
		{/if}
	</p>
{:else}
	<ul class="admin-rows">
		{#each projects as project (project.id)}
			<li class="admin-row">
				<div class="admin-row__main">
					<p class="admin-row__titleline">
						<a class="admin-row__link" href="/admin/dashboard/{project.id}">{project.title}</a>
						<span class="status status--{project.status}">{project.status}</span>
					</p>
					<p class="admin-row__meta">
						<span class="admin-row__who">{authorName(project.submitter)}</span>
						<a class="admin-row__mail" href="mailto:{project.submitter.email}"
							>{project.submitter.email}</a
						>
						<span>{project.department}</span>
					</p>
				</div>
				<div class="admin-row__side">
					<span class="admin-row__date">{formatDate(project.created_at)}</span>
					{#if project.status === 'pending'}
						<span class="admin-row__wait">{waitingLabel(project.created_at)}</span>
					{/if}
					{#if project.status === 'published'}
						<a
							class="admin-row__live"
							href="/projects/{project.slug}"
							target="_blank"
							rel="noreferrer">View live</a
						>
					{/if}
					<span class="admin-row__file">
						{#if project.source_filename}
							{project.source_filename}
						{:else}
							no original file
						{/if}
					</span>
				</div>
			</li>
		{/each}
	</ul>
{/if}

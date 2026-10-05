<script lang="ts">
	import AdminQueue from '#lib/components/AdminQueue.svelte';
	import { FILTERS } from '#lib/admin-queue';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const titles: Record<string, string> = {
		pending: 'Waiting to be read',
		published: 'Published',
		rejected: 'Rejected',
		all: 'Everything'
	};
</script>

<svelte:head>
	<title>Review queue — Colby Tech Share</title>
</svelte:head>

<div class="admin-page">
	<h1>Review queue</h1>

	{#if data.deleted}
		<p class="notice" role="status">
			Deleted <strong>{data.deleted}</strong> and its original file.
		</p>
	{/if}
	{#if data.notice}
		<p class="notice" role="status">{data.notice}</p>
	{/if}

	<nav class="admin-tabs" aria-label="Filter by status">
		{#each FILTERS as filter (filter)}
			<a
				href="/admin/dashboard?status={filter}"
				aria-current={data.status === filter ? 'page' : undefined}
			>
				{titles[filter]}
			</a>
		{/each}
	</nav>

	<p class="results-count">
		{data.projects.length}
		{data.projects.length === 1 ? 'write-up' : 'write-ups'} — {titles[data.status].toLowerCase()}.
	</p>

	<AdminQueue projects={data.projects} />
</div>

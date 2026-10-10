<script lang="ts">
	import AdminQueue from '#lib/components/AdminQueue.svelte';
	import { FILTERS } from '#lib/admin-queue';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/** The tabs are short so a row of them stays one row; the sentence below spells them out. */
	const tabs: Record<string, string> = {
		pending: 'Waiting',
		published: 'Published',
		rejected: 'Rejected',
		all: 'Everything'
	};

	const states: Record<string, string> = {
		pending: 'waiting to be read',
		published: 'published',
		rejected: 'rejected',
		all: 'everything'
	};

	const q = $derived(data.q ?? '');
	const tabHref = (filter: string) =>
		`/admin/dashboard?status=${filter}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
</script>

<svelte:head>
	<title>Review queue — Colby Tech Share</title>
</svelte:head>

<div class="admin-page">
	<header class="admin-head">
		<h1>Review queue</h1>
		<p class="results-count" role="status">
			{data.projects.length}
			{data.projects.length === 1 ? 'write-up' : 'write-ups'} — {states[data.status]}{#if q},
				matching “{q}”{/if}.
		</p>
	</header>

	{#if data.deleted}
		<p class="notice notice--good" role="status">
			Deleted <strong>{data.deleted}</strong> and its original file.
		</p>
	{/if}
	{#if data.notice}
		<p class="notice" role="status">{data.notice}</p>
	{/if}

	<div class="admin-controls">
		<nav class="admin-tabs" aria-label="Filter by status">
			{#each FILTERS as filter (filter)}
				<a href={tabHref(filter)} aria-current={data.status === filter ? 'page' : undefined}>
					{tabs[filter]}<span class="admin-tabs__count">{data.counts[filter]}</span>
				</a>
			{/each}
		</nav>

		<!-- A plain GET form: search works with JavaScript off, and the current tab rides along. -->
		<form class="admin-search" method="get" action="/admin/dashboard" role="search">
			<input type="hidden" name="status" value={data.status} />
			<label class="sr-only" for="queue-search">Search the queue</label>
			<input
				id="queue-search"
				name="q"
				type="search"
				value={q}
				placeholder="Search title, sender, unit, tools…"
			/>
			<button type="submit" class="button--quiet">Search</button>
		</form>
	</div>

	<AdminQueue projects={data.projects} {q} />
</div>

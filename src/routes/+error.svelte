<script lang="ts">
	import { page } from '$app/state';

	const status = $derived(page.status);
	const message = $derived(page.error?.message ?? 'Something went wrong while loading that page.');
</script>

<svelte:head>
	<title>{status} · Colby Tech Share</title>
</svelte:head>

<div class="error-page">
	<h1>{status === 404 ? 'Page not found' : `Error ${status}`}</h1>
	<p>{message}</p>
	<p>
		<a class="button" href="/">Back to Explore</a>
		<a class="button button--quiet" href="/submit">Submit a write-up</a>
	</p>
</div>

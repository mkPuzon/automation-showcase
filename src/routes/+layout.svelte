<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Colby Automation Showcase</title>
</svelte:head>

<header class="site-header">
	<div class="shell nav">
		<a class="brand" href="/">Colby Automation Showcase</a>
		<nav class="nav-links" aria-label="Main navigation">
			<a href="/">Explore</a>
			<a href="/submit">Submit a project</a>
		</nav>
	</div>
</header>

<main class="shell">{@render children()}</main>

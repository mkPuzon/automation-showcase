<script lang="ts">
	import { resolve } from '$app/paths';
	import favicon from '$lib/assets/favicon.png';
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Colby Automation Showcase</title>
</svelte:head>

<header class="site-header">
	<div class="shell nav">
		<a class="brand" href={resolve('/')}>Colby Automation Showcase</a>
		<nav class="nav-links" aria-label="Main navigation">
			<a href={resolve('/')}>Explore</a>
			<a href={resolve('/submit')}>Share a project</a>
		</nav>
	</div>
</header>

<main class="shell">{@render children()}</main>

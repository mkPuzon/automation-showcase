<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Colby Tech Share Forum</title>
</svelte:head>

<header class="site-header">
	<div class="site-header__inner">
		<a class="site-title" href="/">Colby Tech Share</a>
		<nav class="nav" aria-label="Main">
			<a href="/" aria-current={page.url.pathname === '/' ? 'page' : undefined}>Explore</a>
			<a href="/submit" aria-current={page.url.pathname === '/submit' ? 'page' : undefined}>
				Submit
			</a>
		</nav>
	</div>
</header>

<main class="container">
	{@render children()}
</main>

<footer class="site-footer">
	<div class="container">Colby staff &amp; faculty sharing tools that save time.</div>
</footer>

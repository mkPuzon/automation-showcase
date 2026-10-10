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
		<a class="site-title" href="/">
			<!-- the mark: three sticker dots in the DAI colors, overlapping like a share -->
			<svg class="logo-mark" width="27" height="26" viewBox="0 0 27 26" aria-hidden="true">
				<circle cx="8.5" cy="9" r="7.5" fill="#366bcf" stroke="#fff9ef" stroke-width="2" />
				<circle cx="19" cy="10.5" r="7.5" fill="#ffb500" stroke="#fff9ef" stroke-width="2" />
				<circle cx="11" cy="17.5" r="7.5" fill="#52d128" stroke="#fff9ef" stroke-width="2" />
			</svg>
			Colby Tech Share
		</a>
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
	<div class="container">
		<svg width="27" height="12" viewBox="0 0 27 12" aria-hidden="true">
			<circle cx="6" cy="6" r="4.5" fill="#366bcf" />
			<circle cx="13.5" cy="6" r="4.5" fill="#ffb500" />
			<circle cx="21" cy="6" r="4.5" fill="#52d128" />
		</svg>
		Colby staff &amp; faculty sharing tools that save time.
	</div>
</footer>

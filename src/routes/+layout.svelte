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
		<a class="brand" href={resolve('/')} aria-label="Colby Automation Showcase home">
			<span class="brand-name">Colby <em>Automation</em> Showcase</span>
		</a>
		<nav class="nav-links" aria-label="Main navigation">
			<a href={resolve('/')}>Explore</a>
			<a class="nav-share" href={resolve('/submit')}
				>Share a project <span aria-hidden="true">↗</span></a
			>
		</nav>
	</div>
</header>

<main class="shell">{@render children()}</main>

<footer class="site-footer">
	<div class="shell footer-inner">
		<div class="footer-note">
			<p>We hope these projects can give you an idea of how to get back time from the repetitive work that comes along with your job.</p>
		</div>
		<div class="footer-links">
			<p>Questions? Reach out to davisai@colby.edu</p>
		</div>
	</div>
	<div class="shell footer-bottom">
		<span>Colby Automation Showcase</span>
		<span>DavisAI 2026</span>
	</div>
</footer>

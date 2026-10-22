<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';

	let { children } = $props();

	// The admin screens are a workplace, not a page of the public site: they carry their own slim
	// bar (in the dashboard layout) instead of the public header and footer.
	const isAdmin = $derived(page.url.pathname.startsWith('/admin'));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Colby Tech Share Forum</title>
</svelte:head>

{#if !isAdmin}
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
{/if}

<main class="container">
	{@render children()}
</main>

{#if !isAdmin}
	<footer class="site-footer">
		<div class="container">
			<svg width="27" height="12" viewBox="0 0 27 12" aria-hidden="true">
				<circle cx="6" cy="6" r="4.5" fill="#366bcf" />
				<circle cx="13.5" cy="6" r="4.5" fill="#ffb500" />
				<circle cx="21" cy="6" r="4.5" fill="#52d128" />
			</svg>
			A place for Colby staff &amp; faculty to share how they make use of modern technology.
			<!-- the reviewed seal: the site's signature, rocked into the corner —
			     everything here cleared review before it was hung -->
			<svg class="footer-sticker" width="96" height="96" viewBox="0 0 128 128" aria-hidden="true">
				<defs>
					<path id="sticker-ring" d="M64,64 m-38,0 a38,38 0 1,1 76,0 a38,38 0 1,1 -76,0" />
				</defs>
				<path
					d="M116.00 64.00 A17.50 17.50 0 0 1 109.03 90.00 A17.50 17.50 0 0 1 90.00 109.03 A17.50 17.50 0 0 1 64.00 116.00 A17.50 17.50 0 0 1 38.00 109.03 A17.50 17.50 0 0 1 18.97 90.00 A17.50 17.50 0 0 1 12.00 64.00 A17.50 17.50 0 0 1 18.97 38.00 A17.50 17.50 0 0 1 38.00 18.97 A17.50 17.50 0 0 1 64.00 12.00 A17.50 17.50 0 0 1 90.00 18.97 A17.50 17.50 0 0 1 109.03 38.00 A17.50 17.50 0 0 1 116.00 64.00 Z"
					fill="#ffe022"
				/>
				<text
					fill="#2d5cb8"
					font-family="Nunito, sans-serif"
					font-weight="800"
					font-size="9.5"
					letter-spacing="1.7"
				>
					<textPath href="#sticker-ring">SAVE TIME FOR WHAT MATTERS</textPath>
				</text>
				<circle cx="64" cy="63" r="16.5" fill="#366bcf" />
				<path
					d="M56.5 63.5 L62 69 L72 57.5"
					stroke="#ffe022"
					stroke-width="3.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					fill="none"
				/>
			</svg>
		</div>
	</footer>
{/if}

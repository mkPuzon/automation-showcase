<script lang="ts">
	import ProjectBrowser from '#lib/components/ProjectBrowser.svelte';
	import type { PageData } from './$types';

	let { data } = $props() satisfies PageData;
</script>

<div class="explore-head">
	<div>
		<h1>
			Explore
			<!-- a hand-drawn amber underline for the page's name -->
			<svg class="squiggle" viewBox="0 0 120 12" aria-hidden="true">
				<path
					d="M3 8 Q 13 2, 23 8 T 43 8 T 63 8 T 83 8 T 103 8 T 117 7"
					fill="none"
					stroke="#ffb500"
					stroke-width="4"
					stroke-linecap="round"
				/>
			</svg>
		</h1>
		<p class="lede">
			Automations, tools, and tips Colby staff and faculty use to get their week back. Everything
			here was written up by a colleague and reviewed before it was published.
		</p>
	</div>

	{#if !data.problem}
		<!-- The reviewed sticker: every project on this shelf cleared review before it was hung.
		     Static ink — the promise it makes is the site's whole premise. -->
		<svg class="explore-sticker" width="122" height="122" viewBox="0 0 128 128" aria-hidden="true">
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
	{/if}
</div>

{#if data.problem}
	<div class="notice" role="alert">{data.problem}</div>
{:else}
	<ProjectBrowser projects={data.projects} />
{/if}

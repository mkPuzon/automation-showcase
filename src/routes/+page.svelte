<script lang="ts">
	import ProjectBrowser from '#lib/components/ProjectBrowser.svelte';
	import type { PageData } from './$types';

	let { data } = $props() satisfies PageData;
</script>

<div class="explore-head">
	<!-- the mark, set loose beside the head's text: a carrier point rides the
	     border of the free ground right of the text while the three dots it
	     carries hold a triangle formation that keeps closing into the logo and
	     floating apart again. Pure decoration: pointerless, behind the content,
	     and anchored to the head — it scrolls away with the page. -->
	<!-- the mark, cut loose beside the head's text: three dots of different
	     sizes wander a shared field on loops of their own — always drifting
	     together or apart, so the logo keeps re-forming and scattering. Pure
	     decoration: pointerless, behind the content, and anchored to the head —
	     it scrolls away with the page. -->
	<div class="logo-drift" aria-hidden="true">
		<div class="logo-drift__field">
			<span class="logo-drift__dot logo-drift__dot--blue"></span>
			<span class="logo-drift__dot logo-drift__dot--amber"></span>
			<span class="logo-drift__dot logo-drift__dot--green"></span>
		</div>
	</div>

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
</div>

{#if data.problem}
	<div class="notice" role="alert">{data.problem}</div>
{:else}
	<ProjectBrowser projects={data.projects} />
{/if}

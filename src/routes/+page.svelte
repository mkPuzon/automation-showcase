<script lang="ts">
	import ProjectBrowser from '#lib/components/ProjectBrowser.svelte';
	import type { PageData } from './$types';

	let { data } = $props() satisfies PageData;
</script>

<svelte:head>
	<title>Explore · Colby Tech Share</title>
</svelte:head>

<div class="explore-head">
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
			Welcome to the Colby Tech Share! Explore how your colleagues are using technology to solve
			problems, simplify tasks, and make more time for what matters through short articles and
			tutorials. Each offers practical ideas you can adapt to your own work.
			<br /><br />
			Scroll down below to find a solution to a repetitive task, inspiration for course activities, or
			discover a new tool. Have a project you'd like to share? Use the submission form
			<a href="/submit" style="text-decoration: none;">here</a>. All Colby faculty and staff are
			eligible to share projects.
			<br /><br />
			Note that this site is made specifically for the Colby community. It is only visible to on Colby's
			network, not the larger internet.
		</p>
	</div>
</div>

{#if data.problem}
	<div class="notice" role="alert">{data.problem}</div>
{:else}
	<ProjectBrowser projects={data.projects} />
{/if}

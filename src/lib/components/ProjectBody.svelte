<script lang="ts">
	import { inspectBodyHtml } from '#lib/markdown';

	interface Props {
		/** HTML as sanitized by FastAPI (api/app/rendering.py). */
		html?: string;
		/** Fallback shown when the guard refuses the fragment. */
		markdown?: string;
	}

	let { html = '', markdown = '' }: Props = $props();

	const body = $derived(inspectBodyHtml(html));

	$effect(() => {
		if (!body.ok) {
			// For whoever is watching the server/browser console, not for the reader.
			console.warn(`techshare: refusing to render a project body (${body.reason})`);
		}
	});
</script>

{#if body.ok && body.html !== ''}
	<article class="prose">
		<!-- FastAPI sanitized this (api/app/rendering.py), and inspectBodyHtml above refuses anything
		     with a live tag, event handler or unsafe URL, so it only renders in the ok branch. -->
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html body.html}
	</article>
{:else if markdown.trim() !== ''}
	<div class="notice">
		This write-up could not be displayed as formatted text, so it is shown as Markdown source.
	</div>
	<pre class="prose prose--source">{markdown}</pre>
{:else}
	<p class="meta">This project has no written-up body yet.</p>
{/if}

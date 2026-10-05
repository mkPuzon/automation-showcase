<script lang="ts">
	import AdminProjectEditor from '#lib/components/AdminProjectEditor.svelte';
	import type { AdminDraft } from '#lib/types';
	import type { PageData } from './$types';

	let {
		data,
		form
	}: {
		data: PageData;
		form?: Record<string, unknown> | null;
	} = $props();

	/**
	 * Whatever the last action handed back. Four of them can, each with its own line and its own
	 * reason, so this is deliberately loose rather than a discriminated union: a plain page load has
	 * none of these keys and an action sets one.
	 *
	 * Note this is *not* gated on `form.message` — the preview action succeeds, and returns HTML with
	 * no message at all.
	 */
	type Returned = {
		message?: string | null;
		draft?: AdminDraft | null;
		slugMessage?: string | null;
		statusMessage?: string | null;
		deleteMessage?: string | null;
		preview?: string | null;
	};
	const returned: Returned = $derived((form ?? {}) as Returned);
</script>

<svelte:head>
	<title>{data.project.title} — review — Colby Tech Share</title>
</svelte:head>

<AdminProjectEditor
	project={data.project}
	notice={data.notice}
	queue={data.queue}
	message={returned.message ?? null}
	draft={returned.draft ?? null}
	slugMessage={returned.slugMessage ?? null}
	statusMessage={returned.statusMessage ?? null}
	deleteMessage={returned.deleteMessage ?? null}
	preview={returned.preview ?? null}
/>

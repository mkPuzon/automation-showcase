<script lang="ts">
	/**
	 * Submit — one route, two screens: the form, and the pending confirmation once a write-up has
	 * been filed (`form.ok`). A new navigation back to `/submit` clears `form`, so "Submit another
	 * write-up" is just a link.
	 */
	import SubmissionForm from '#lib/components/SubmissionForm.svelte';
	import SubmissionReceipt from '#lib/components/SubmissionReceipt.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Submit a write-up · Colby Tech Share</title>
</svelte:head>

{#if form?.ok && form.submission}
	<SubmissionReceipt submission={form.submission} warning={form.warning} />
{:else}
	<h1>Submit a write-up</h1>
	<p class="lede">
		Figured out time-saving trick in Workday? Learned of a new Moodle feature? Built a tool that saved you an afternoon?
		We'd love to hear about it! Share how you are using technology to help the larger Colby community save time for what matters.
	</p>

	<SubmissionForm
		renderToken={data.renderToken}
		template_url={data.template_url}
		waited={data.waited}
		values={form?.values}
		errors={form?.errors ?? {}}
		message={form?.message ?? null}
	/>

	<h2>What happens next</h2>
	<ul class="hint submit-steps">
		<li>
			Your write-up lands as <strong>pending</strong> — it is not on Explore yet, and has no public page.
		</li>
		<li>
			An admin reads it, fixes any formatting the <code>.docx</code> export mangled, then publishes it.
		</li>
		<li>
			Published is when it shows up in Explore and becomes searchable by technology and department.
		</li>
	</ul>
{/if}

<style>
	.submit-steps {
		max-width: 40rem;
		line-height: 1.7;
	}
</style>

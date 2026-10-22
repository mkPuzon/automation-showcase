<script lang="ts">
	/**
	 * The pending confirmation screen (Phase 3's "your submission is awaiting review" state).
	 *
	 * Deliberately not a link to `/projects/<slug>`: a pending write-up is not public, and
	 * `GET /api/projects/{slug}` answers 404 for it. Showing the slug as text is still useful — it
	 * is what an admin will recognise if the submitter asks about it later.
	 */
	import { formatDate } from '#lib/format';
	import type { SubmissionResult } from '#lib/types';

	interface Props {
		submission: SubmissionResult;
		/** The soft email warning from the API — submitted fine, looked slightly unusual. */
		warning?: string | null;
	}

	let { submission, warning = null }: Props = $props();
</script>

<section class="receipt" aria-labelledby="receipt-heading">
	<h1 id="receipt-heading">Your write-up is submitted, thank you!</h1>

	<p class="receipt__title">
		{submission.title}
		<span class="status status--{submission.status}">
			{submission.status === 'pending' ? 'Pending review' : submission.status}
		</span>
	</p>

	<p>
		Filed <time datetime={submission.created_at}>{formatDate(submission.created_at)}</time> as
		project <code>#{submission.id}</code>. A site admin will review it before it appears on Explore Page.
		If there are any issues with the submission we will contact you at your colby.edu email.
	</p>

	{#if warning}
		<div class="notice notice--warning">{warning}</div>
	{/if}

	<p class="receipt__actions">
		<a class="button" href="/">Back to Explore</a>
		<a class="button button--quiet" href="/submit">Submit another write-up</a>
	</p>
</section>

<style>
	.receipt {
		max-width: 40rem;
	}

	.receipt__title {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		flex-wrap: wrap;
		font-size: 1.15rem;
		font-weight: 600;
		margin-bottom: 1rem;
	}

	.receipt__actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-top: 1.5rem;
	}

	.receipt__actions :global(.button) {
		text-decoration: none;
	}
</style>

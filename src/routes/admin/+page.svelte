<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// `form.message` is what the action handed back: a wrong password, an empty one, or the
	// "not configured" sentence. Load's notice is for being bounced here by an expired session.
	const notice = $derived(form?.message ?? data.notice);
</script>

<svelte:head>
	<title>Sign in — Colby Tech Share</title>
</svelte:head>

<nav class="breadcrumbs" aria-label="Breadcrumb">
	<a href="/">Explore</a>
	<span aria-hidden="true">/</span>
	<span>Sign in</span>
</nav>

<div class="admin-signin">
	<h1>Review queue</h1>
	<p class="lede">
		This page is not linked from the site. It is for whoever reads write-ups before Colby sees them.
	</p>

	{#if data.waited}
		<p class="notice notice--warning" role="status">
			Too many sign-in attempts from this address. Try again in {data.waited}.
		</p>
	{/if}

	{#if notice}
		<p class="notice" role="status">{notice}</p>
	{/if}

	{#if data.configured}
		<form method="post" use:enhance>
			<div class="field">
				<label for="password">Admin password</label>
				<!-- autocomplete=off: a saved admin password in a shared library machine is the one
				     outcome a sign-in form should actively discourage. -->
				<input
					id="password"
					name="password"
					type="password"
					autocomplete="off"
					required
					maxlength="200"
				/>
				<span class="hint"> A session lasts eight hours and ends when this browser closes. </span>
			</div>
			<button type="submit">Sign in</button>
		</form>
	{:else}
		<p class="notice notice--warning">
			Sign in is unavailable, and the message above says why. Nothing is broken in the queue itself
			— submissions still arrive and stay pending.
		</p>
	{/if}
</div>

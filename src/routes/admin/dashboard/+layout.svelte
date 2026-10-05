<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="admin-shell">
	<div class="admin-bar">
		<a class="admin-bar__brand" href="/admin/dashboard">Review queue</a>
		<div class="admin-bar__right">
			<a href="/submit" target="_blank" rel="noreferrer">Submit page</a>
			<!-- Absolute action: this bar sits above the editor too, and the logout action lives on the
			     dashboard page. -->
			<form method="post" action="/admin/dashboard?/logout" use:enhance>
				<button type="submit" class="button--quiet">Sign out</button>
			</form>
		</div>
	</div>
	{@render children()}
</div>

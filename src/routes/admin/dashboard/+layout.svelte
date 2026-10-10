<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="admin-shell">
	<!-- The reviewer's bar: slim, sticky, and the only chrome these screens wear. -->
	<div class="admin-bar">
		<a class="admin-bar__brand" href="/admin/dashboard">
			<svg width="27" height="26" viewBox="0 0 27 26" aria-hidden="true">
				<circle cx="8.5" cy="9" r="7.5" fill="#366bcf" stroke="#fff9ef" stroke-width="2" />
				<circle cx="19" cy="10.5" r="7.5" fill="#ffb500" stroke="#fff9ef" stroke-width="2" />
				<circle cx="11" cy="17.5" r="7.5" fill="#52d128" stroke="#fff9ef" stroke-width="2" />
			</svg>
			Colby Tech Share
		</a>
		<div class="admin-bar__right">
			<a href="/">View site</a>
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

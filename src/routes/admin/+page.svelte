<script lang="ts">
	import { onMount } from 'svelte';
	import { api, type Project } from '$lib/api';

	let password = $state('');
	let projects = $state<Project[]>([]);
	let loggedIn = $state(false);
	let loading = $state(true);
	let error = $state('');
	let notice = $state('');
	let deletingId = $state<number | null>(null);

	async function loadProjects() {
		try {
			projects = await api<Project[]>('/api/admin/projects');
			loggedIn = true;
		} catch (err) {
			if ((err instanceof Error ? err.message : '').includes('Admin login')) loggedIn = false;
			else error = err instanceof Error ? err.message : 'Could not load projects.';
		} finally {
			loading = false;
		}
	}

	onMount(loadProjects);

	async function login() {
		error = '';
		try {
			await api('/api/admin/login?password=' + encodeURIComponent(password), { method: 'POST' });
			password = '';
			await loadProjects();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Login failed.';
		}
	}

	async function save(project: Project) {
		error = '';
		notice = '';
		try {
			const updated = await api<Project>(`/api/admin/projects/${project.id}`, {
				method: 'PATCH',
				body: JSON.stringify({
					title: project.title,
					description_markdown: project.description_markdown,
					contributors: project.contributors,
					tools: project.tools,
					department: project.department,
					submitter_email: project.submitter_email,
					status: project.status,
					rejection_reason: project.rejection_reason
				})
			});
			projects = projects.map((item) => item.id === updated.id ? updated : item);
			notice = `Saved “${updated.title}”.`;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not save project.';
		}
	}

	async function deleteProject(project: Project) {
		if (!confirm(`Delete “${project.title}”? This cannot be undone.`)) return;
		error = '';
		notice = '';
		deletingId = project.id;
		try {
			await api<void>(`/api/admin/projects/${project.id}`, { method: 'DELETE' });
			projects = projects.filter((item) => item.id !== project.id);
			notice = `Deleted “${project.title}”.`;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not delete project.';
		} finally {
			deletingId = null;
		}
	}

	async function logout() {
		await api('/api/admin/logout', { method: 'POST' });
		loggedIn = false;
		projects = [];
	}
</script>

<svelte:head><title>Admin · Colby Automation Showcase</title></svelte:head>

<div class="page-header">
	<p class="meta">PRIVATE WORKSPACE</p>
	<h1>Review projects.</h1>
	<p class="muted">Approve, edit, or reject submissions before they become part of the public showcase.</p>
</div>

{#if !loggedIn}
	<div class="card">
		<p class="muted">This page is intentionally not linked from the public project content. Enter the admin password to continue.</p>
	{#if error}<p class="error">{error}</p>{/if}
		<form onsubmit={(event) => { event.preventDefault(); login(); }}>
			<label for="password">Admin password</label>
			<input id="password" type="password" bind:value={password} required />
			<div class="actions"><button>Sign in</button></div>
		</form>
	</div>
{:else}
	<div class="actions"><button class="secondary" onclick={logout}>Sign out</button></div>
	{#if notice}<p class="success">{notice}</p>{/if}
	{#if error}<p class="error">{error}</p>{/if}
	{#if loading}<p>Loading…</p>{:else if projects.length === 0}<p class="card">No projects submitted.</p>{/if}
	{#each projects as project}
		<section class="card admin-card">
			<p class="status" data-status={project.status}>{project.status}</p>
			<details>
				<summary>Rendered Markdown preview</summary>
				<div class="rendered">{@html project.description_html}</div>
			</details>
			<label for={`title-${project.id}`}>Title</label>
			<input id={`title-${project.id}`} bind:value={project.title} />
			<label for={`description-${project.id}`}>Description (Markdown)</label>
			<textarea id={`description-${project.id}`} bind:value={project.description_markdown}></textarea>
			<label for={`contributors-${project.id}`}>Contributors (comma separated)</label>
			<input id={`contributors-${project.id}`} value={project.contributors.join(', ')} oninput={(event) => project.contributors = (event.currentTarget as HTMLInputElement).value.split(',').map((value) => value.trim()).filter(Boolean)} />
			<label for={`tools-${project.id}`}>Tools (comma separated)</label>
			<input id={`tools-${project.id}`} value={project.tools.join(', ')} oninput={(event) => project.tools = (event.currentTarget as HTMLInputElement).value.split(',').map((value) => value.trim()).filter(Boolean)} />
			<label for={`department-${project.id}`}>Department</label>
			<input id={`department-${project.id}`} bind:value={project.department} />
			<label for={`email-${project.id}`}>Submitter email</label>
			<input id={`email-${project.id}`} bind:value={project.submitter_email} />
			<label for={`status-${project.id}`}>Status</label>
			<select id={`status-${project.id}`} bind:value={project.status}>
				<option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
			</select>
			<label for={`reason-${project.id}`}>Rejection reason (optional)</label>
			<input id={`reason-${project.id}`} bind:value={project.rejection_reason} placeholder="Optional note for the record" />
			<div class="actions">
				<button onclick={() => save(project)}>Save changes</button>
				<button class="secondary" disabled={deletingId === project.id} onclick={() => deleteProject(project)}>{deletingId === project.id ? 'Deleting…' : 'Delete project'}</button>
			</div>
		</section>
	{/each}
{/if}

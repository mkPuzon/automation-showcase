<script lang="ts">
	import { onMount } from 'svelte';
	import { api, type Project } from '$lib/api';

	type SortMode = 'priority' | 'newest' | 'oldest' | 'title';

	let password = $state('');
	let projects = $state<Project[]>([]);
	let loggedIn = $state(false);
	let loading = $state(true);
	let refreshing = $state(false);
	let saving = $state(false);
	let error = $state('');
	let notice = $state('');
	let search = $state('');
	let statusFilter = $state('all');
	let sortMode = $state<SortMode>('priority');
	let deletingId = $state<number | null>(null);
	let uploadingId = $state<number | null>(null);
	let editingProject = $state<Project | null>(null);
	let originalProject = $state<Project | null>(null);
	let previewHtml = $state('');
	let previewRequest = 0;

	const statusLabels: Record<string, string> = {
		all: 'All projects',
		pending: 'Pending',
		approved: 'Approved',
		rejected: 'Rejected'
	};

	let counts = $derived({
		all: projects.length,
		pending: projects.filter((project) => project.status === 'pending').length,
		approved: projects.filter((project) => project.status === 'approved').length,
		rejected: projects.filter((project) => project.status === 'rejected').length
	});

	let filteredProjects = $derived.by(() => {
		const query = search.trim().toLowerCase();
		const matching = projects.filter((project) => {
			const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
			const searchable = [
				project.title,
				project.description_markdown,
				project.contributors.join(' '),
				project.tools.join(' '),
				project.department,
				project.submitter_email,
				String(project.id)
			]
				.join(' ')
				.toLowerCase();
			return matchesStatus && (!query || searchable.includes(query));
		});

		return [...matching].sort((a, b) => {
			if (sortMode === 'title') return a.title.localeCompare(b.title);
			if (sortMode === 'oldest') return dateValue(a.submitted_at) - dateValue(b.submitted_at);
			if (sortMode === 'newest') return dateValue(b.submitted_at) - dateValue(a.submitted_at);
			const statusOrder = { pending: 0, approved: 1, rejected: 2 };
			return (statusOrder[a.status as keyof typeof statusOrder] ?? 3) -
				(statusOrder[b.status as keyof typeof statusOrder] ?? 3) ||
				dateValue(b.submitted_at) - dateValue(a.submitted_at);
		});
	});

	let isDirty = $derived(
		Boolean(editingProject && originalProject && JSON.stringify(editingProject) !== JSON.stringify(originalProject))
	);

	function dateValue(value: string) {
		return new Date(value).getTime();
	}

	function formatDate(value: string) {
		return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
			new Date(value)
		);
	}

	function clearFeedback() {
		error = '';
		notice = '';
	}

	async function loadProjects(showRefresh = false) {
		if (showRefresh) refreshing = true;
		clearFeedback();
		try {
			projects = await api<Project[]>('/api/admin/projects');
			loggedIn = true;
		} catch (err) {
			if ((err instanceof Error ? err.message : '').includes('Admin login')) loggedIn = false;
			else error = err instanceof Error ? err.message : 'Could not load projects.';
		} finally {
			loading = false;
			refreshing = false;
		}
	}

	onMount(() => loadProjects());

	async function login() {
		clearFeedback();
		try {
			await api('/api/admin/login?password=' + encodeURIComponent(password), { method: 'POST' });
			password = '';
			loading = true;
			await loadProjects();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Login failed.';
			loading = false;
		}
	}

	function cloneProject(project: Project): Project {
		return JSON.parse(JSON.stringify(project)) as Project;
	}

	function openEditor(project: Project) {
		editingProject = cloneProject(project);
		originalProject = cloneProject(project);
		previewHtml = project.description_html;
		clearFeedback();
	}

	function closeEditor() {
		if (isDirty && !confirm('Discard your unsaved changes?')) return;
		editingProject = null;
		originalProject = null;
	}

	async function updatePreview(source: string) {
		const request = ++previewRequest;
		try {
			const result = await api<{ html: string }>('/api/markdown/preview', {
			method: 'POST',
			body: JSON.stringify({ source })
			});
			if (request === previewRequest) previewHtml = result.html;
		} catch {
			// The saved preview remains available if a draft preview request fails.
		}
	}

	async function save() {
		if (!editingProject) return;
		clearFeedback();
		saving = true;
		try {
			const updated = await api<Project>(`/api/admin/projects/${editingProject.id}`, {
				method: 'PATCH',
				body: JSON.stringify({
					title: editingProject.title,
					description_markdown: editingProject.description_markdown,
					contributors: editingProject.contributors,
					tools: editingProject.tools,
					department: editingProject.department,
					submitter_email: editingProject.submitter_email,
					status: editingProject.status,
					rejection_reason: editingProject.rejection_reason
				})
			});
			projects = projects.map((project) => (project.id === updated.id ? updated : project));
			editingProject = cloneProject(updated);
			originalProject = cloneProject(updated);
			previewHtml = updated.description_html;
			notice = `Saved “${updated.title}”.`;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not save project.';
		} finally {
			saving = false;
		}
	}

	async function uploadImage(event: Event) {
		if (!editingProject) return;
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		if (!/\.(png|jpg)$/i.test(file.name) || !['image/png', 'image/jpeg'].includes(file.type)) {
			error = 'Images must be PNG or JPG files.';
			input.value = '';
			return;
		}
		if (file.size > 5 * 1024 * 1024) {
			error = 'Images must be 5 MB or smaller.';
			input.value = '';
			return;
		}
		uploadingId = editingProject.id;
		clearFeedback();
		try {
			const formData = new FormData();
			formData.append('file', file);
			const result = await api<{ markdown: string }>(`/api/admin/projects/${editingProject.id}/images`, {
				method: 'POST',
				body: formData
			});
			editingProject.description_markdown += `${editingProject.description_markdown.trim() ? '\n\n' : ''}${result.markdown}`;
			await updatePreview(editingProject.description_markdown);
			notice = 'Image added. Save changes to update the project description.';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not upload image.';
		} finally {
			uploadingId = null;
			input.value = '';
		}
	}

	async function deleteProject(project: Project) {
		if (!confirm(`Delete “${project.title}”? This cannot be undone.`)) return;
		clearFeedback();
		deletingId = project.id;
		try {
			await api<void>(`/api/admin/projects/${project.id}`, { method: 'DELETE' });
			projects = projects.filter((item) => item.id !== project.id);
			if (editingProject?.id === project.id) {
				editingProject = null;
				originalProject = null;
			}
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
		editingProject = null;
		originalProject = null;
	}
</script>

<svelte:head><title>Admin dashboard · Colby Automation Showcase</title></svelte:head>

<div class="page-header admin-header">
	<p class="meta">DEVELOPER PAGE</p>
	<h1>Project dashboard</h1>
</div>

{#if !loggedIn}
	<div class="card admin-login">
		<p class="muted">Enter the admin password to manage submitted projects.</p>
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		<form onsubmit={(event) => { event.preventDefault(); login(); }}>
			<label for="password">Admin password</label>
			<input id="password" type="password" bind:value={password} required autocomplete="current-password" />
			<div class="actions"><button>Sign in</button></div>
		</form>
	</div>
{:else}
	<div class="admin-toolbar">
		<div class="actions">
			<button class="secondary" onclick={() => loadProjects(true)} disabled={refreshing}>
				{refreshing ? 'Refreshing…' : 'Refresh'}
			</button>
			<button class="secondary" onclick={logout}>Sign out</button>
		</div>
	</div>

	{#if notice}<p class="success" role="status">{notice}</p>{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}

	<div class="admin-stats" aria-label="Project statistics">
		{#each ['all', 'pending', 'approved', 'rejected'] as status}
			<button class:active={statusFilter === status} class="stat" onclick={() => (statusFilter = status)}>
				<span class="stat-label">{statusLabels[status]}</span>
				<strong>{counts[status as keyof typeof counts]}</strong>
				<span class="stat-action">View {status === 'all' ? 'all' : status}</span>
			</button>
		{/each}
	</div>

	<section class="admin-workspace" aria-labelledby="projects-heading">
		<div class="workspace-heading">
			<div>
				<h2 id="projects-heading">Submitted projects</h2>
				<p class="muted">Search by title, content, contributor, tool, department, email, or ID.</p>
			</div>
			<p class="results-count" aria-live="polite">{filteredProjects.length} of {counts.all} shown</p>
		</div>
		<div class="admin-filters">
			<div class="filter-field search-field">
				<label for="project-search">Search projects</label>
				<input id="project-search" type="search" bind:value={search} placeholder="Search projects…" />
			</div>
			<div class="filter-field">
				<label for="status-filter">Status</label>
				<select id="status-filter" bind:value={statusFilter}>
					{#each Object.entries(statusLabels) as [value, label]}<option value={value}>{label}</option>{/each}
				</select>
			</div>
			<div class="filter-field">
				<label for="sort-projects">Sort by</label>
				<select id="sort-projects" bind:value={sortMode}>
					<option value="priority">Pending first</option>
					<option value="newest">Newest first</option>
					<option value="oldest">Oldest first</option>
					<option value="title">Title A–Z</option>
				</select>
			</div>
			{#if search || statusFilter !== 'all'}<button class="secondary filter-clear" onclick={() => { search = ''; statusFilter = 'all'; }}>Clear filters</button>{/if}
		</div>

		{#if loading}
			<div class="admin-loading" aria-label="Loading projects"><span></span><span></span><span></span></div>
		{:else if filteredProjects.length === 0}
			<div class="empty-results">
				<h3>{counts.all === 0 ? 'No projects submitted yet.' : 'No projects match these filters.'}</h3>
				<p class="muted">{counts.all === 0 ? 'Submitted projects will appear here for review.' : 'Try a different search or clear the active filters.'}</p>
				{#if search || statusFilter !== 'all'}<button class="secondary" onclick={() => { search = ''; statusFilter = 'all'; }}>Clear filters</button>{/if}
			</div>
		{:else}
			<div class="project-list">
				{#each filteredProjects as project (project.id)}
					<article class="project-row" class:project-row--selected={editingProject?.id === project.id}>
						<div class="project-row-main">
							<div class="project-row-title">
								<span class="status" data-status={project.status}>{project.status}</span>
								<span class="project-id">#{project.id}</span>
							</div>
							<h3>{project.title}</h3>
							<p class="project-preview">{project.description_markdown.replace(/[#*_`\n]/g, ' ').replace(/\s+/g, ' ').trim()}</p>
							<div class="project-meta"><span>{project.department}</span><span>{project.submitter_email}</span><span>Submitted {formatDate(project.submitted_at)}</span></div>
						</div>
						<div class="project-row-actions"><button onclick={() => openEditor(project)}>{editingProject?.id === project.id ? 'Editing' : 'Edit project'}</button></div>
					</article>
				{/each}
			</div>
		{/if}
	</section>

	{#if editingProject}
		<div class="editor-backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) closeEditor(); }}>
			<div class="editor-panel" role="dialog" aria-modal="true" aria-labelledby="editor-title">
				<div class="editor-header">
					<div><p class="meta">EDIT PROJECT #{editingProject.id}</p><h2 id="editor-title">{editingProject.title || 'Untitled project'}</h2></div>
					<button class="close-button" aria-label="Close project editor" onclick={closeEditor}>Close</button>
				</div>
				{#if isDirty}<p class="unsaved-note">Unsaved changes</p>{/if}
				<div class="editor-grid">
					<div class="editor-fields">
						<label for={`title-${editingProject.id}`}>Title</label>
						<input id={`title-${editingProject.id}`} bind:value={editingProject.title} />
						<label for={`description-${editingProject.id}`}>Description (Markdown)</label>
						<textarea id={`description-${editingProject.id}`} bind:value={editingProject.description_markdown} oninput={() => updatePreview(editingProject?.description_markdown ?? '')}></textarea>
						<label for={`image-${editingProject.id}`}>Add image</label>
						<input id={`image-${editingProject.id}`} type="file" accept=".png,.jpg,image/png,image/jpeg" onchange={uploadImage} disabled={uploadingId === editingProject.id} />
						<span class="helper">PNG or JPG, up to 5 MB. The image is appended to the Markdown source.</span>
						<label for={`contributors-${editingProject.id}`}>Contributors (comma separated)</label>
						<input id={`contributors-${editingProject.id}`} value={editingProject.contributors.join(', ')} oninput={(event) => (editingProject!.contributors = (event.currentTarget as HTMLInputElement).value.split(',').map((value) => value.trim()).filter(Boolean))} />
						<label for={`tools-${editingProject.id}`}>Tools (comma separated)</label>
						<input id={`tools-${editingProject.id}`} value={editingProject.tools.join(', ')} oninput={(event) => (editingProject!.tools = (event.currentTarget as HTMLInputElement).value.split(',').map((value) => value.trim()).filter(Boolean))} />
						<label for={`department-${editingProject.id}`}>Department</label>
						<input id={`department-${editingProject.id}`} bind:value={editingProject.department} />
						<label for={`email-${editingProject.id}`}>Submitter email</label>
						<input id={`email-${editingProject.id}`} type="email" bind:value={editingProject.submitter_email} />
						<label for={`status-${editingProject.id}`}>Status</label>
						<select id={`status-${editingProject.id}`} bind:value={editingProject.status}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select>
						<label for={`reason-${editingProject.id}`}>Rejection reason (optional)</label>
						<input id={`reason-${editingProject.id}`} bind:value={editingProject.rejection_reason} placeholder="Optional note for the record" />
						<div class="actions editor-actions"><button onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button><button class="secondary" onclick={closeEditor}>Cancel</button><button class="danger" disabled={deletingId === editingProject.id} onclick={() => deleteProject(editingProject!)}>{deletingId === editingProject.id ? 'Deleting…' : 'Delete project'}</button></div>
					</div>
					<div class="editor-preview"><div class="preview-heading"><h3>Rendered preview</h3><span class="helper">Updates as you edit</span></div><div class="rendered">{@html previewHtml}</div></div>
				</div>
			</div>
		</div>
	{/if}
{/if}

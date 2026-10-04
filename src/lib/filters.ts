/**
 * Explore filtering, done in the browser (locked decision #10): SvelteKit loads every published
 * project's metadata once, then these pure helpers narrow it. No URL params, no extra requests.
 */

import { authorName } from '#lib/format';
import type { ProjectSummary } from '#lib/types';

export interface ProjectFilterState {
	/** free-text title search */
	q: string;
	technology: string;
	department: string;
	author: string;
}

export const EMPTY_FILTERS: ProjectFilterState = {
	q: '',
	technology: '',
	department: '',
	author: ''
};

export function filtersActive(filters: ProjectFilterState): boolean {
	return Boolean(filters.q.trim() || filters.technology || filters.department || filters.author);
}

export function filterProjects(
	projects: ProjectSummary[],
	filters: ProjectFilterState
): ProjectSummary[] {
	const q = filters.q.trim().toLowerCase();
	return projects.filter((project) => {
		if (q && !project.title.toLowerCase().includes(q)) return false;
		if (filters.technology && !project.technologies.includes(filters.technology)) return false;
		if (filters.department && project.department !== filters.department) return false;
		if (filters.author && authorName(project.submitter) !== filters.author) return false;
		return true;
	});
}

function uniqueSorted(values: Iterable<string>): string[] {
	return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

export function technologyOptions(projects: ProjectSummary[]): string[] {
	return uniqueSorted(projects.flatMap((project) => project.technologies));
}

export function departmentOptions(projects: ProjectSummary[]): string[] {
	return uniqueSorted(projects.map((project) => project.department));
}

export function authorOptions(projects: ProjectSummary[]): string[] {
	return uniqueSorted(projects.map((project) => authorName(project.submitter)));
}

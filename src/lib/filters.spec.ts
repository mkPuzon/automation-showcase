import { describe, expect, it } from 'vitest';
import {
	authorOptions,
	departmentOptions,
	EMPTY_FILTERS,
	filterProjects,
	filtersActive,
	technologyOptions
} from '#lib/filters';
import { projects } from '../tests/fixtures';

describe('filterProjects', () => {
	it('returns everything when no filter is set', () => {
		expect(filterProjects(projects, EMPTY_FILTERS)).toHaveLength(3);
		expect(filtersActive(EMPTY_FILTERS)).toBe(false);
	});

	it('matches title text case-insensitively and ignores surrounding space', () => {
		const hits = filterProjects(projects, { ...EMPTY_FILTERS, q: '  RUBRIC ' });
		expect(hits.map((project) => project.id)).toEqual([2]);
	});

	it('filters by technology, including technologies beyond the first', () => {
		expect(
			filterProjects(projects, { ...EMPTY_FILTERS, technology: 'Python' }).map((p) => p.id)
		).toEqual([2, 1]);
		expect(
			filterProjects(projects, { ...EMPTY_FILTERS, technology: 'tidyverse' }).map((p) => p.id)
		).toEqual([3]);
	});

	it('filters by department and author', () => {
		expect(
			filterProjects(projects, { ...EMPTY_FILTERS, department: 'Environmental Studies' }).map(
				(project) => project.id
			)
		).toEqual([3]);
		expect(
			filterProjects(projects, { ...EMPTY_FILTERS, author: 'Marie Dubois' }).map(
				(project) => project.id
			)
		).toEqual([1]);
	});

	it('combines filters (title AND technology) and reports empties honestly', () => {
		const filters = { ...EMPTY_FILTERS, q: 'watershed', technology: 'Python' };
		expect(filterProjects(projects, filters)).toEqual([]);
		expect(filtersActive(filters)).toBe(true);
	});
});

describe('filter options', () => {
	it('offers each option once, sorted, from the loaded projects', () => {
		expect(technologyOptions(projects)).toEqual([
			'Cron',
			'Google Docs',
			'Google Sheets',
			'pandas',
			'Python',
			'R',
			'tidyverse'
		]);
		expect(departmentOptions(projects)).toEqual([
			'Computational Science',
			'Computing Services',
			'Environmental Studies'
		]);
		expect(authorOptions(projects)).toEqual(['April Taylor', 'Jessie Chen', 'Marie Dubois']);
	});
});

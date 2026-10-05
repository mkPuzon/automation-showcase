/** Shared sample projects for the Explore component tests (not imported by app code). */

import type { SubmissionValues } from '#lib/validation';
import type { ProjectDetail, ProjectSummary, SubmissionResult, SubmitterBrief } from '#lib/types';

const marie: SubmitterBrief = {
	id: 1,
	first_name: 'Marie',
	last_name: 'Dubois',
	departments: ['Computing Services', 'Digital Learning']
};

const jessie: SubmitterBrief = {
	id: 2,
	first_name: 'Jessie',
	last_name: 'Chen',
	departments: ['Computational Science']
};

const april: SubmitterBrief = {
	id: 3,
	first_name: 'April',
	last_name: 'Taylor',
	departments: ['Environmental Studies']
};

function project(
	partial: Partial<ProjectSummary> & Pick<ProjectSummary, 'id' | 'slug' | 'title'>
): ProjectSummary {
	return {
		department: 'Computing Services',
		technologies: [],
		contributors: [],
		status: 'published',
		created_at: '2026-10-01T00:00:00Z',
		updated_at: '2026-10-01T00:00:00Z',
		submitter: marie,
		...partial
	};
}

export const projects: ProjectSummary[] = [
	project({
		id: 2,
		slug: 'grading-120-lab-reports-2026-10-01-aa01',
		title: 'Grading 120 Lab Reports with a Rubric Macro',
		department: 'Computational Science',
		technologies: ['Python', 'pandas', 'Google Docs'],
		submitter: jessie
	}),
	project({
		id: 1,
		slug: 'auto-filling-the-faculty-directory-2026-09-18-aa02',
		title: 'Auto-filling the Faculty Directory Update Form',
		department: 'Computing Services',
		technologies: ['Python', 'Google Sheets', 'Cron'],
		contributors: ['Karen Vreeland'],
		submitter: marie
	}),
	project({
		id: 3,
		slug: 'cleaning-up-watershed-sensor-exports-2026-09-29-aa03',
		title: 'Cleaning Up Watershed Sensor Exports Before Class',
		department: 'Environmental Studies',
		technologies: ['R', 'tidyverse'],
		contributors: ['Owen Brantley'],
		submitter: april
	})
];

export const detail: ProjectDetail = {
	...projects[0],
	body_markdown: '## Using it\n\n1. Open the sheet\n2. Run `python post.py`\n',
	body_html:
		'<h2>Using it</h2><ol><li>Open the sheet</li><li>Run <code>python post.py</code></li></ol>',
	source_filename: 'rubric-macro.docx'
};

/** The shape FastAPI produces for a link: target/rel are set by api/app/rendering.py. */
export const renderedWithLink =
	'<p>Read the <a href="https://example.colby.edu/roster" target="_blank" rel="noopener noreferrer nofollow">roster sheet</a>.</p>';

/** A submission that passes every rule in src/lib/validation.ts — the API client's happy path. */
export const submissionValues: SubmissionValues = {
	first_name: 'Jessie',
	last_name: 'Chen',
	email: 'jessie.chen@colby.edu',
	department: 'Computational Science',
	title: 'Renaming 400 scanned syllabi without touching the filenames by hand',
	technologies: ['Python', 'zsh'],
	contributors: ['Owen Brantley']
};

/** What `POST /api/submissions` hands back for a fresh write-up — the receipt's happy path. */
export const pendingSubmission: SubmissionResult = {
	id: 41,
	slug: 'renaming-scanned-syllabi-2026-10-05-aa04',
	title: 'Renaming 400 scanned syllabi without touching the filenames by hand',
	status: 'pending',
	created_at: '2026-10-05T14:30:00Z',
	warning: null
};

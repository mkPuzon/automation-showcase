/** Mirrors `api/app/models.py`. Dates arrive from FastAPI as ISO-8601 strings. */

export type Status = 'pending' | 'published' | 'rejected';

export interface SubmitterBrief {
	id: number;
	first_name: string;
	last_name: string;
	departments: string[];
}

/** Metadata only — what Explore needs to filter without another round trip. */
export interface ProjectSummary {
	id: number;
	slug: string;
	title: string;
	department: string;
	technologies: string[];
	contributors: string[];
	status: Status;
	created_at: string;
	updated_at: string;
	submitter: SubmitterBrief;
}

export interface ProjectDetail extends ProjectSummary {
	body_markdown: string;
	body_html: string;
	source_filename: string | null;
}

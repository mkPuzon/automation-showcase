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

/**
 * What `POST /api/submissions` answers with (mirrors `SubmissionResult` in api/app/models.py).
 * Enough for the pending confirmation screen; no email, as everywhere outside admin.
 */
export interface SubmissionResult {
	id: number;
	slug: string;
	title: string;
	status: Status;
	created_at: string;
	/** The soft half of the email rule — submitted fine, looked slightly unusual. */
	warning: string | null;
}

// --- admin payloads: mirrors of the `/api/admin` models, the only place an email ever appears ---

/** The dashboard's filter: the three real statuses, or all of them at once. */
export type StatusFilter = Status | 'all';

export interface AdminSubmitter extends SubmitterBrief {
	email: string;
}

/** The review queue row: public metadata, plus the submitter's email and the original file. */
export interface AdminProjectSummary extends ProjectSummary {
	submitter: AdminSubmitter;
	source_filename: string | null;
	/** Path of the stored `.docx` relative to the uploads volume; no route downloads it (Phase 5). */
	source_path: string | null;
}

/** One project in the editor — the queue row plus the body the textarea will hold. */
export interface AdminProjectDetail extends AdminProjectSummary {
	body_markdown: string;
	body_html: string;
}

/**
 * `PATCH /api/admin/projects/{id}` (mirrors `AdminProjectEdit`). A field you leave out is left
 * alone; `slug` is only ever sent by the control that is labelled as moving the web address.
 */
export interface AdminProjectEdit {
	title?: string;
	department?: string;
	technologies?: string[];
	contributors?: string[];
	body_markdown?: string;
	slug?: string;
}

/**
 * The admin editor's form, as the browser sends it: one string per field, the two lists
 * comma-separated in a single input. Sent back unchanged by an action that refused the edit, so the
 * admin is not asked to retype it.
 */
export interface AdminDraft {
	title: string;
	department: string;
	technologies: string;
	contributors: string;
	body_markdown: string;
}

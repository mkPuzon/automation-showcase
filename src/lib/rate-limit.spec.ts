/**
 * The fixed-window limiter behind `/submit` (and, from Phase 4, `/admin`'s login). Time is passed
 * in, so these tests are about the counting and the window arithmetic rather than about waiting.
 */

import { describe, expect, it } from 'vitest';
import { createRateLimiter, formatWait } from '#lib/rate-limit';

const WINDOW = 60_000;
const T0 = 1_760_000_000_000;

describe('createRateLimiter', () => {
	it('allows up to the limit and then blocks with a wait', () => {
		const limiter = createRateLimiter({ limit: 3, windowMs: WINDOW });

		expect(limiter.consume('140.14.1.1', T0)).toEqual({
			allowed: true,
			retryAfterSeconds: 0,
			remaining: 2
		});
		limiter.consume('140.14.1.1', T0 + 1000);
		expect(limiter.consume('140.14.1.1', T0 + 2000).remaining).toBe(0);

		expect(limiter.consume('140.14.1.1', T0 + 3000)).toEqual({
			allowed: false,
			retryAfterSeconds: 57,
			remaining: 0
		});
	});

	it('tracks each key on its own', () => {
		const limiter = createRateLimiter({ limit: 1, windowMs: WINDOW });

		expect(limiter.consume('marie', T0).allowed).toBe(true);
		expect(limiter.consume('marie', T0 + 1000).allowed).toBe(false);
		expect(limiter.consume('jessie', T0 + 1000).allowed).toBe(true);
	});

	it('opens again when the window rolls over, from a fresh start', () => {
		const limiter = createRateLimiter({ limit: 1, windowMs: WINDOW });
		limiter.consume('140.14.1.1', T0);

		expect(limiter.consume('140.14.1.1', T0 + WINDOW)).toEqual({
			allowed: true,
			retryAfterSeconds: 0,
			remaining: 0
		});
		// The new window starts at that request, not at the old boundary.
		expect(limiter.consume('140.14.1.1', T0 + WINDOW + 1000).allowed).toBe(false);
	});

	it('counts the requests it rejected, so the window cannot be stretched', () => {
		const limiter = createRateLimiter({ limit: 1, windowMs: WINDOW });
		limiter.consume('140.14.1.1', T0);
		for (let i = 1; i < 20; i += 1) limiter.consume('140.14.1.1', T0 + i * 1000);

		expect(limiter.consume('140.14.1.1', T0 + WINDOW).allowed).toBe(true);
	});

	it('drops expired windows once it has grown unwieldy', () => {
		const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
		for (let i = 0; i < 5100; i += 1) limiter.consume(`10.0.${Math.floor(i / 256)}.${i % 256}`, T0);
		const grown = limiter.size();

		// A later check prunes: every earlier window is long expired by then.
		limiter.consume('140.14.1.1', T0 + 10 * 60_000);
		expect(limiter.size()).toBeLessThan(grown);
	});
});

describe('formatWait', () => {
	it.each([
		[1, '1 second'],
		[45, '45 seconds'],
		[119, '119 seconds'],
		[120, '2 minutes'],
		[90, '90 seconds']
	])('%i seconds reads as %s', (seconds, expected) => {
		expect(formatWait(seconds)).toBe(expected);
	});

	it('rounds a partial minute up', () => {
		expect(formatWait(241)).toBe('5 minutes');
	});
});

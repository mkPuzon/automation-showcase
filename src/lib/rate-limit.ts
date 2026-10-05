/**
 * In-process fixed-window rate limiting (locked decision #7).
 *
 * "In-process" is the honest limitation: state lives in one web replica's memory, so the limit is
 * per replica and resets on restart. That is enough for a campus tool with one replica and no
 * accounts — see "Known simplifications" in TODO.md. If the web service ever runs with more than
 * one replica this needs to move somewhere shared (Postgres would do).
 *
 * Windows are fixed, not sliding: a window boundary lets a burst of `limit` through. For a junk-post
 * speed bump that is fine, and it keeps the implementation to a Map and a subtraction.
 */

export interface RateLimitRule {
	/** How many requests are allowed per window. */
	limit: number;
	windowMs: number;
}

export interface RateLimitOutcome {
	allowed: boolean;
	/** Whole seconds until the current window opens again; 0 when allowed. */
	retryAfterSeconds: number;
	remaining: number;
}

export interface RateLimiter {
	consume(key: string, now?: number): RateLimitOutcome;
	/** Number of tracked keys — non-zero forever unless pruned, which `consume` does for us. */
	size(): number;
}

/** Above this many keys, expired windows get dropped on the next check. */
const MAX_KEYS = 5000;

export function createRateLimiter(rule: RateLimitRule): RateLimiter {
	const windows = new Map<string, { startsAt: number; count: number }>();

	const prune = (now: number) => {
		for (const [key, window] of windows) {
			if (now - window.startsAt >= rule.windowMs) windows.delete(key);
		}
	};

	return {
		consume(key: string, now: number = Date.now()): RateLimitOutcome {
			if (windows.size > MAX_KEYS) prune(now);

			const window = windows.get(key);
			if (!window || now - window.startsAt >= rule.windowMs) {
				windows.set(key, { startsAt: now, count: 1 });
				return { allowed: true, retryAfterSeconds: 0, remaining: rule.limit - 1 };
			}

			window.count += 1;
			if (window.count > rule.limit) {
				const waitMs = rule.windowMs - (now - window.startsAt);
				return {
					allowed: false,
					retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)),
					remaining: 0
				};
			}
			return { allowed: true, retryAfterSeconds: 0, remaining: rule.limit - window.count };
		},
		size: () => windows.size
	};
}

export function formatWait(seconds: number): string {
	if (seconds >= 120) {
		const minutes = Math.ceil(seconds / 60);
		return `${minutes} minute${minutes === 1 ? '' : 's'}`;
	}
	return `${seconds} second${seconds === 1 ? '' : 's'}`;
}

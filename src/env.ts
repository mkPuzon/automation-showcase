/**
 * Environment variables, typed the SvelteKit 3 way (read at sync/build time, generated into
 * `$app/env/private` and `$app/env/public`).
 *
 * Two rules this project lives with:
 *
 * - Nothing is required-without-a-fallback yet. `.env` is maintained by hand here, and a missing
 *   variable should degrade one feature, not stop `npm run dev`.
 * - Server-only values are declared private and imported from `$app/env/private`; anything the
 *   browser legitimately needs (the template link) is declared `public: true`.
 *
 * `ADMIN_PASSWORD` is private and optional on purpose: Phase 4's admin sign-in reads it, and a
 * missing value means "admin is off" (the sign-in page explains itself and every admin route refuses
 * entry) rather than "the app will not boot".
 */

import { defineEnvVars } from '@sveltejs/kit/env';

const trimmed = (value: string | undefined): string => value?.trim() ?? '';

export const variables = defineEnvVars({
	// Where SvelteKit reaches FastAPI: http://api:8000 in compose, http://localhost:8000 on the host.
	API_URL: {
		schema: (value) => trimmed(value).replace(/\/+$/, '') || 'http://localhost:8000',
		description: 'Base URL of the techshare FastAPI service (server-side only).'
	},
	// HMAC key for the anti-bot render token now, and for the admin session token in Phase 4.
	// Empty falls back to a per-process key, which is fine locally and wrong in production.
	SESSION_SECRET: {
		schema: trimmed,
		description: 'HMAC key shared by web and api. `openssl rand -hex 32`.'
	},
	// The one admin credential (locked decision #17: no user accounts). Deliberately not required:
	// unset, `/admin` explains that sign-in is not configured instead of the app failing to start.
	ADMIN_PASSWORD: {
		schema: trimmed,
		description: 'Password for /admin. Server-side only; never sent to the browser.'
	},
	// The Google Docs write-up template linked from /submit (locked decision #11). Empty means no
	// template has been published yet, and the form says so instead of linking nowhere.
	PUBLIC_TEMPLATE_URL: {
		public: true,
		schema: (value) => {
			const url = trimmed(value);
			if (url !== '' && !/^https?:\/\//i.test(url)) {
				throw new Error('PUBLIC_TEMPLATE_URL must be an http(s) URL');
			}
			return url;
		},
		description: 'Link to the Google Docs write-up template shown on the Submit page.'
	}
});

/**
 * Server-side environment variables (SvelteKit 3 reads this file at sync/build time and
 * generates types for `$app/env/private`). Add the Phase 3/4 variables here as they land:
 * `PUBLIC_TEMPLATE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `ORIGIN`.
 *
 * Nothing declared below may be required-without-a-fallback yet: `.env` is managed by hand on
 * this project, and a missing variable should not stop `npm run dev`.
 */

import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	// Where SvelteKit reaches FastAPI: http://api:8000 in compose, http://localhost:8000 on the host.
	API_URL: {
		schema: (value) => value?.trim().replace(/\/+$/, '') || 'http://localhost:8000',
		description: 'Base URL of the techshare FastAPI service (server-side only).'
	}
});

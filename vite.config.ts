import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { cspDirectives } from './src/csp.ts';

export default defineConfig(({ command }) => ({
	plugins: [
		sveltekit({
			// The impeccable live-mode dev helper (a dev-only overlay injected into
			// +layout.svelte) still imports via the classic `$lib` specifier; SvelteKit 3
			// removed that alias by default, so restore it here. Dev tooling only.
			alias: {
				$lib: 'src/lib',
				'$lib/*': 'src/lib/*'
			},

			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-node: we deploy with Docker on campus (Dokploy handles routing), so the
			// build target is a plain Node server on PORT 3000. See compose.yml.
			adapter: adapter(),

			// A Content-Security-Policy header on every server-rendered page. `mode: 'auto'` hands Kit
			// the job of noncing the inline scripts and styles Kit itself emits (and hashing them on a
			// prerendered page, where a nonce would be static and so useless). Directives, and why each
			// one is what it is: src/csp.ts.
			csp: {
				mode: 'auto',
				directives: cspDirectives({ dev: command === 'serve' })
			}
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
}));

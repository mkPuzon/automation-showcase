// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}

		interface Locals {
			/**
			 * The address to rate limit, resolved once in `src/hooks.server.ts` from what Dokploy's
			 * proxy sends (`X-Real-IP`, else the right-most `X-Forwarded-For` hop). Read it from
			 * `locals` rather than calling `getClientAddress()` in a route — behind the proxy that is
			 * the proxy's address, not the visitor's.
			 */
			clientIp: string;
		}

		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};

import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const trailingSlash = 'ignore';

// Connection-specific headers must not cross a proxy boundary.
function proxyHeaders(source: Headers) {
	const headers = new Headers(source);
	const connectionHeaders = (headers.get('connection') ?? '').split(',');
	for (const name of [
		...connectionHeaders,
		'connection',
		'keep-alive',
		'proxy-authenticate',
		'proxy-authorization',
		'te',
		'trailer',
		'transfer-encoding',
		'upgrade',
		'host',
		'content-length'
	]) {
		if (name.trim()) headers.delete(name.trim());
	}
	return headers;
}

const proxy: RequestHandler = async ({ request, url }) => {
	// Only the server controls the destination; never use a browser-supplied host.
	const upstream = new URL(env.INTERNAL_API_URL || 'http://api:8000');
	upstream.pathname = url.pathname;
	upstream.search = url.search;

	const headers = proxyHeaders(request.headers);
	headers.set('accept-encoding', 'identity');
	// Read outside the fetch catch so adapter-node's upload-limit errors stay 413s.
	const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();

	try {
		const response = await fetch(upstream, {
			method: request.method,
			headers,
			body,
			redirect: 'manual'
		});
		const responseHeaders = proxyHeaders(response.headers);
		// Fetch decompresses upstream responses automatically.
		responseHeaders.delete('content-encoding');

		// Keep backend redirects on the public origin, rather than exposing Docker DNS.
		const location = responseHeaders.get('location');
		if (location) {
			const target = new URL(location, upstream);
			if (target.origin === upstream.origin) {
				responseHeaders.set('location', `${target.pathname}${target.search}${target.hash}`);
			}
		}

		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: responseHeaders
		});
	} catch {
		return json({ detail: 'API service is unavailable.' }, { status: 502 });
	}
};

export {
	proxy as GET,
	proxy as HEAD,
	proxy as POST,
	proxy as PUT,
	proxy as PATCH,
	proxy as DELETE,
	proxy as OPTIONS
};

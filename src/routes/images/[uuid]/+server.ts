import { error } from '@sveltejs/kit';
import { API_URL } from '$app/env/private';

export async function GET({ params, fetch }) {
	const res = await fetch(`${API_URL}/images/${params.uuid}`);
	if (!res.ok) error(404, 'image not found');
	const buf = await res.arrayBuffer();
	return new Response(buf, {
		headers: {
			'Content-Type': res.headers.get('content-type') ?? 'application/octet-stream',
			'Cache-Control': 'public, max-age=86400'
		}
	});
}

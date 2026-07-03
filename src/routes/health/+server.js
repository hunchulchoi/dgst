import { json } from '@sveltejs/kit';

export function GET({ request }) {
  if (request.headers.get('x-health-token') !== process.env.HEALTHCHECK_TOKEN) {
    return new Response('Not Found', { status: 404 });
  }

  return json(
    { ok: true, status: 'ok' },
    {
      headers: {
        'cache-control': 'no-store'
      }
    }
  );
}

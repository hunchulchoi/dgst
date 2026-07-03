import { json } from '@sveltejs/kit';
import { env as dynamicEnv } from '$env/dynamic/private';

export function GET({ request }) {
  const secret = dynamicEnv.HEALTHCHECK_TOKEN || process.env.HEALTHCHECK_TOKEN;

  if (request.headers.get('x-health-token') !== secret) {
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

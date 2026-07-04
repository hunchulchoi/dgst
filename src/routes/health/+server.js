import { json } from '@sveltejs/kit';
export function GET() {
  return json(
    { ok: true, status: 'ok' },
    {
      headers: {
        'cache-control': 'no-store'
      }
    }
  );
}

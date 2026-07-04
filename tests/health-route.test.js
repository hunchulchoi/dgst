import { describe, expect, it } from 'vitest';

describe('health route', () => {
  it('returns a no-store ok response without authentication', async () => {
    const { GET } = await import('../src/routes/health/+server.js');

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body).toEqual({ ok: true, status: 'ok' });
  });
});

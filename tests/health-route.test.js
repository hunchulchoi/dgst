// @ts-nocheck
import { afterEach, describe, expect, it } from 'vitest';

describe('health route', () => {
  afterEach(() => {
    delete process.env.HEALTHCHECK_TOKEN;
  });

  it('hides the health endpoint when the monitor token is missing', async () => {
    process.env.HEALTHCHECK_TOKEN = 'secret-token';
    const { GET } = await import('../src/routes/health/+server.js');

    const response = await GET({
      request: new Request('https://dgst.me/health')
    });

    expect(response.status).toBe(404);
  });

  it('hides the health endpoint when the monitor token is wrong', async () => {
    process.env.HEALTHCHECK_TOKEN = 'secret-token';
    const { GET } = await import('../src/routes/health/+server.js');

    const response = await GET({
      request: new Request('https://dgst.me/health', {
        headers: { 'x-health-token': 'wrong-token' }
      })
    });

    expect(response.status).toBe(404);
  });

  it('returns a no-store ok response when the monitor token matches', async () => {
    process.env.HEALTHCHECK_TOKEN = 'secret-token';
    const { GET } = await import('../src/routes/health/+server.js');

    const response = await GET({
      request: new Request('https://dgst.me/health', {
        headers: { 'x-health-token': 'secret-token' }
      })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body).toEqual({ ok: true, status: 'ok' });
  });
});

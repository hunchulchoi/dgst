import { describe, expect, it, vi } from 'vitest';
import { load } from '../src/routes/login/+page.server.js';

describe('login error recovery', () => {
  it('recovers an existing valid session after a duplicate OAuth callback', async () => {
    const event = {
      url: new URL('https://www.dgst.me/login?error=Configuration'),
      cookies: { get: vi.fn(), delete: vi.fn() },
      locals: { auth: vi.fn().mockResolvedValue({ user: { nickname: 'member' } }) }
    };

    await expect(
      load(/** @type {Parameters<typeof load>[0]} */ (/** @type {unknown} */ (event)))
    ).rejects.toMatchObject({ status: 302, location: '/' });
    expect(event.locals.auth).toHaveBeenCalledTimes(1);
  });

  it('requires another sign-in when there is no verified session', async () => {
    const event = {
      url: new URL('https://www.dgst.me/login?error=Configuration'),
      cookies: { get: vi.fn(), delete: vi.fn() },
      locals: { auth: vi.fn().mockResolvedValue(null) }
    };

    await expect(
      load(/** @type {Parameters<typeof load>[0]} */ (/** @type {unknown} */ (event)))
    ).resolves.toEqual({ error: 'Configuration', recovery: null });
  });

  it('consumes a recovery hint without accepting it as authentication', async () => {
    const event = {
      url: new URL('https://www.dgst.me/login?error=Configuration'),
      cookies: {
        get: vi.fn().mockReturnValue(JSON.stringify({ provider: 'google', reason: 'expired' })),
        delete: vi.fn()
      },
      locals: { auth: vi.fn().mockResolvedValue(null) }
    };
    await expect(
      load(/** @type {Parameters<typeof load>[0]} */ (/** @type {unknown} */ (event)))
    ).resolves.toEqual({
      error: 'Configuration',
      recovery: { provider: 'google', reason: 'expired' }
    });
    expect(event.cookies.delete).toHaveBeenCalledWith(
      'dgst.auth-recovery',
      expect.objectContaining({ path: '/login' })
    );
    expect(event.locals.auth).toHaveBeenCalledOnce();
  });
});

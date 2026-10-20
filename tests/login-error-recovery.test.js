import { describe, expect, it, vi } from 'vitest';
import { load } from '../src/routes/login/+page.server.js';

describe('login error recovery', () => {
  it('recovers an existing valid session after a duplicate OAuth callback', async () => {
    const event = {
      url: new URL('https://www.dgst.me/login?error=Configuration'),
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
      locals: { auth: vi.fn().mockResolvedValue(null) }
    };

    await expect(
      load(/** @type {Parameters<typeof load>[0]} */ (/** @type {unknown} */ (event)))
    ).resolves.toEqual({ error: 'Configuration' });
  });
});

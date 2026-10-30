import { describe, expect, it, vi } from 'vitest';
import { offerSignInRecovery, takeSignInRecovery } from '../src/lib/server/auth/recovery.js';

function fixture() {
  const cookies = {
    get: vi.fn(),
    serialize: vi.fn().mockReturnValue('dgst.auth-recovery=hint; Path=/login; HttpOnly'),
    delete: vi.fn()
  };
  const event = /** @type {import('@sveltejs/kit').RequestEvent} */ (
    /** @type {unknown} */ ({
      url: new URL('https://www.dgst.me/auth/callback/google'),
      cookies
    })
  );
  return { cookies, event };
}

describe('server sign-in recovery hints', () => {
  it.each(['expired', 'cookie-missing'])('offers a short-lived hint for %s', (reason) => {
    const { cookies, event } = fixture();
    const original = Response.redirect('https://www.dgst.me/login?error=Configuration', 302);
    const response = offerSignInRecovery(
      event,
      {
        authErrorType: 'InvalidCheck',
        check: 'pkce',
        classification: 'failed',
        reason
      },
      original
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(original.headers.get('location'));
    expect(response.headers.get('set-cookie')).toContain('dgst.auth-recovery=hint');
    expect(cookies.serialize).toHaveBeenCalledWith(
      'dgst.auth-recovery',
      JSON.stringify({ provider: 'google', reason }),
      expect.objectContaining({
        path: '/login',
        maxAge: 120,
        httpOnly: true,
        sameSite: 'lax',
        secure: true
      })
    );
  });

  it('preserves Auth.js response cookies while appending the recovery hint', () => {
    const { event } = fixture();
    const headers = new Headers({ location: '/login?error=Configuration' });
    headers.append('set-cookie', 'authjs.pkce.code_verifier=; Max-Age=0; Path=/');
    headers.append('set-cookie', 'authjs.state=; Max-Age=0; Path=/');
    const response = offerSignInRecovery(
      event,
      {
        authErrorType: 'InvalidCheck',
        check: 'pkce',
        classification: 'failed',
        reason: 'expired'
      },
      new Response(null, { status: 302, headers })
    );
    expect(response.headers.getSetCookie()).toHaveLength(3);
    expect(response.headers.getSetCookie()[0]).toContain('authjs.pkce.code_verifier=;');
    expect(response.headers.getSetCookie()[1]).toContain('authjs.state=;');
  });

  it.each([
    {
      authErrorType: 'InvalidCheck',
      check: 'pkce',
      classification: 'replayed',
      reason: 'cookie-missing'
    },
    { authErrorType: 'InvalidCheck', check: 'state', classification: 'failed', reason: 'expired' },
    {
      authErrorType: 'InvalidCheck',
      check: 'pkce',
      classification: 'failed',
      reason: 'decryption-failed'
    },
    {
      authErrorType: 'CallbackRouteError',
      check: 'other',
      classification: 'denied',
      reason: 'issuer-missing'
    }
  ])('does not automatically retry other failures: $reason', (failure) => {
    const { cookies, event } = fixture();
    const response = Response.redirect('https://www.dgst.me/login?error=Configuration', 302);
    expect(offerSignInRecovery(event, failure, response)).toBe(response);
    expect(cookies.serialize).not.toHaveBeenCalled();
  });

  it.each([
    ['Configuration', null],
    ['Configuration', '{bad json'],
    ['Configuration', JSON.stringify({ provider: 'https://evil.test', reason: 'expired' })],
    ['Configuration', JSON.stringify({ provider: 'google', reason: 'decryption-failed' })],
    [null, JSON.stringify({ provider: 'google', reason: 'expired' })]
  ])('rejects absent, malformed or inappropriate hints', (error, hint) => {
    const { cookies } = fixture();
    cookies.get.mockReturnValue(hint);
    expect(
      takeSignInRecovery(
        /** @type {import('@sveltejs/kit').Cookies} */ (/** @type {unknown} */ (cookies)),
        error
      )
    ).toBeNull();
  });
});

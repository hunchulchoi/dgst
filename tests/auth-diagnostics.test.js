import { describe, expect, it, vi } from 'vitest';
import { InvalidCheck, CallbackRouteError } from '@auth/core/errors';
import { createAuthDiagnostics, summarizeAuthError } from '../src/lib/server/auth/diagnostics.js';

function fixture() {
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
  let time = 1000;
  return {
    logger,
    diagnostics: createAuthDiagnostics(logger, () => time),
    advance: () => {
      time += 16 * 60 * 1000;
    }
  };
}

/** @param {string} [query] @param {boolean} [cookie] @param {string} [provider] */
function request(query = 'code=private-code', cookie = false, provider = 'google') {
  return /** @type {import('@sveltejs/kit').RequestEvent} */ (
    /** @type {unknown} */ ({
      url: new URL(`https://www.dgst.me/auth/callback/${provider}?${query}`),
      cookies: { get: () => (cookie ? 'private-cookie' : undefined) }
    })
  );
}

/** @param {Error} [cause] */
function pkceError(cause) {
  return new InvalidCheck('pkceCodeVerifier value could not be parsed', { cause });
}

describe('auth diagnostics', () => {
  it('reads direct and Auth.js wrapped causes without exposing their messages', () => {
    const expired = new Error('private-cookie');
    expired.name = 'JWTExpired';
    expect(summarizeAuthError(pkceError(expired), true).reason).toBe('expired');
    const decrypt = new Error('private-secret');
    decrypt.name = 'JWEDecryptionFailed';
    expect(
      summarizeAuthError(pkceError(new Error('wrapper', { cause: { err: decrypt } })), true).reason
    ).toBe('decryption-failed');
    expect(
      summarizeAuthError(pkceError(new Error('pkceCodeVerifier cookie was missing')), false).reason
    ).toBe('cookie-missing');
    expect(
      summarizeAuthError(
        pkceError(new Error('pkceCodeVerifier cookie was created for a different provider')),
        true
      ).reason
    ).toBe('provider-mismatch');
  });

  it('retains an error for a first callback with no PKCE cookie', () => {
    const { logger, diagnostics } = fixture();
    const event = request();
    diagnostics.begin(event);
    diagnostics.logError(pkceError(), event);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'auth.error', reason: 'cookie-missing' })
    );
    expect(diagnostics.failure(event).classification).toBe('failed');
  });

  it('classifies a missing-cookie replay only after a confirmed successful callback', () => {
    const { logger, diagnostics } = fixture();
    const original = request(undefined, true);
    diagnostics.begin(original);
    diagnostics.success(original);
    const replay = request();
    diagnostics.begin(replay);
    diagnostics.logError(pkceError(), replay);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'auth.callback.replayed' })
    );
    expect(diagnostics.failure(replay).classification).toBe('replayed');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('does not hide expired cookies, other checks, different codes or other providers', () => {
    const { logger, diagnostics } = fixture();
    const original = request();
    diagnostics.begin(original);
    diagnostics.success(original);
    const expired = new Error('expired');
    expired.name = 'JWTExpired';
    for (const { event, error } of [
      { event: request(undefined, true), error: pkceError(expired) },
      { event: request(), error: new InvalidCheck('state value could not be parsed') },
      { event: request('code=another'), error: pkceError() },
      { event: request(undefined, false, 'kakao'), error: pkceError() }
    ]) {
      diagnostics.begin(event);
      diagnostics.logError(error, event);
      expect(diagnostics.failure(event).classification).toBe('failed');
    }
    expect(logger.error).toHaveBeenCalledTimes(4);
  });

  it('expires successful callback evidence', () => {
    const { logger, diagnostics, advance } = fixture();
    const original = request();
    diagnostics.begin(original);
    diagnostics.success(original);
    advance();
    const event = request();
    diagnostics.begin(event);
    diagnostics.logError(pkceError(), event);
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('redirects completed codes to the session gate without issuing cookies or accepting new codes', () => {
    const { diagnostics, advance } = fixture();
    const original = request();
    diagnostics.begin(original);
    expect(diagnostics.completedCallback(original)).toBeNull();
    diagnostics.success(original);
    const replay = request();
    diagnostics.begin(replay);
    const response = diagnostics.completedCallback(replay);
    expect(response?.status).toBe(303);
    expect(response?.headers.get('location')).toBe('/login');
    expect(response?.headers.get('set-cookie')).toBeNull();
    expect(response?.headers.get('cache-control')).toBe('no-store');
    const otherCode = request('code=other');
    diagnostics.begin(otherCode);
    expect(diagnostics.completedCallback(otherCode)).toBeNull();
    advance();
    expect(diagnostics.completedCallback(replay)).toBeNull();
  });

  it('isolates origins and request contexts and bounds retained successes', () => {
    const { diagnostics } = fixture();
    const first = request('code=0');
    diagnostics.begin(first);
    diagnostics.success(first);
    const otherOrigin = request('code=0');
    otherOrigin.url = new URL('https://next.dgst.me/auth/callback/google?code=0');
    diagnostics.begin(otherOrigin);
    diagnostics.logError(pkceError(), otherOrigin);
    expect(diagnostics.failure(otherOrigin).classification).toBe('failed');
    for (let index = 1; index <= 1000; index++) {
      const event = request(`code=${index}`);
      diagnostics.begin(event);
      diagnostics.success(event);
    }
    const evicted = request('code=0');
    const retained = request('code=1000');
    diagnostics.begin(evicted);
    diagnostics.begin(retained);
    diagnostics.logError(pkceError(), retained);
    diagnostics.logError(pkceError(), evicted);
    expect(diagnostics.failure(evicted).classification).toBe('failed');
    expect(diagnostics.failure(retained).classification).toBe('replayed');
  });

  it('classifies provider access denial separately and never logs sensitive values', () => {
    const { logger, diagnostics } = fixture();
    const event = request('error=access_denied&code=private-code', true);
    diagnostics.begin(event);
    diagnostics.logError(
      new CallbackRouteError('OAuth callback failed', {
        cause: { err: new Error('response parameter "iss" (issuer) missing private-secret') }
      }),
      event
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'auth.signin.denied', reason: 'issuer-missing' })
    );
    expect(diagnostics.failure(event).classification).toBe('denied');
    diagnostics.logError(pkceError(new Error('private-secret')), event);
    const output = JSON.stringify([logger.error.mock.calls, logger.warn.mock.calls]);
    for (const secret of ['private-code', 'private-cookie', 'private-secret'])
      expect(output).not.toContain(secret);
  });

  it('logs safely when no request context exists and handles cyclic causes', () => {
    const { logger, diagnostics } = fixture();
    const error = {
      type: 'InvalidCheck',
      message: 'pkceCodeVerifier',
      cause: /** @type {unknown} */ (undefined)
    };
    error.cause = error;
    diagnostics.logError(error, undefined);
    expect(logger.error).toHaveBeenCalledOnce();
  });
});

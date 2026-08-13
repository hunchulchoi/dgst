import { describe, expect, it } from 'vitest';

import { evaluateAuthSignIn, resolveSafeAuthRedirect } from '../src/lib/server/auth/authPolicy.js';

describe('authentication sign-in policy', () => {
  it.each(['blocked', 'banned'])('denies %s Kakao users', (state) => {
    expect(
      evaluateAuthSignIn({
        provider: 'kakao',
        user: { id: 'user-1', state },
        profile: { id: 1234 }
      })
    ).toEqual({ allowed: false, reason: 'user-denied' });
  });

  it('allows an active Kakao user without requiring an email field', () => {
    expect(
      evaluateAuthSignIn({
        provider: 'kakao',
        user: { id: 'user-1', state: 'registered' },
        profile: { id: 1234 }
      })
    ).toEqual({ allowed: true });
  });

  it('keeps verified Google sign-in and rejects unverified Google sign-in', () => {
    expect(
      evaluateAuthSignIn({
        provider: 'google',
        user: { id: 'user-1', state: 'registered' },
        profile: { email_verified: true }
      })
    ).toEqual({ allowed: true });
    expect(
      evaluateAuthSignIn({
        provider: 'google',
        user: { id: 'user-1', state: 'registered' },
        profile: { email_verified: false }
      })
    ).toEqual({ allowed: false, reason: 'email-unverified' });
  });
});

describe('authentication redirect policy', () => {
  const baseUrl = 'https://www.dgst.me';

  it('allows internal paths and same-origin absolute URLs', () => {
    expect(resolveSafeAuthRedirect('/board/free?login=1', baseUrl)).toBe(
      'https://www.dgst.me/board/free?login=1'
    );
    expect(resolveSafeAuthRedirect('https://www.dgst.me/auth/profile', baseUrl)).toBe(
      'https://www.dgst.me/auth/profile'
    );
  });

  it.each([
    'https://evil.example/steal',
    '//evil.example/steal',
    'javascript:alert(1)',
    'not a valid redirect'
  ])('falls back to the site origin for unsafe redirect %s', (url) => {
    expect(resolveSafeAuthRedirect(url, baseUrl)).toBe(baseUrl);
  });
});

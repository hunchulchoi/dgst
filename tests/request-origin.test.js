import { describe, expect, it } from 'vitest';
import { shouldRejectCrossOriginRequest } from '../src/lib/server/auth/requestOrigin.js';

describe('shouldRejectCrossOriginRequest', () => {
  it('allows safe methods without origin headers', () => {
    expect(
      shouldRejectCrossOriginRequest({
        method: 'GET',
        requestOrigin: 'https://dgst.me'
      })
    ).toBe(false);
  });

  it('allows same-origin unsafe requests', () => {
    expect(
      shouldRejectCrossOriginRequest({
        method: 'POST',
        origin: 'https://dgst.me',
        requestOrigin: 'https://dgst.me',
        secFetchSite: 'same-origin'
      })
    ).toBe(false);
  });

  it('rejects unsafe requests with a mismatched Origin header', () => {
    expect(
      shouldRejectCrossOriginRequest({
        method: 'POST',
        origin: 'https://evil.example',
        requestOrigin: 'https://dgst.me',
        secFetchSite: 'cross-site'
      })
    ).toBe(true);
  });

  it('rejects unsafe requests marked cross-site even without Origin', () => {
    expect(
      shouldRejectCrossOriginRequest({
        method: 'POST',
        requestOrigin: 'https://dgst.me',
        secFetchSite: 'cross-site'
      })
    ).toBe(true);
  });
});

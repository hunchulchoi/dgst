import { describe, expect, it, vi } from 'vitest';

import { reportClientError } from '../src/lib/util/reportClientPageError.js';

describe('reportClientError', () => {
  it('does not create an unhandled rejection when the log POST fails', async () => {
    const originalFetch = globalThis.fetch;
    const originalConsoleError = console.error;
    const originalLocation = globalThis.location;
    const originalNavigator = globalThis.navigator;

    const logPost = {
      catch: vi.fn()
    };
    globalThis.fetch = /** @type {typeof fetch} */ (vi.fn(() => logPost));
    console.error = vi.fn();
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { href: 'https://www.dgst.me/', pathname: '/', search: '' }
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { userAgent: 'vitest', platform: 'test', language: 'ko-KR' }
    });

    try {
      reportClientError(new Error('source failure'), { type: 'test-client-error' });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/log',
        expect.objectContaining({ keepalive: true })
      );
      expect(logPost.catch).toHaveBeenCalledWith(expect.any(Function));
    } finally {
      globalThis.fetch = originalFetch;
      console.error = originalConsoleError;
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: originalLocation
      });
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: originalNavigator
      });
    }
  });
});

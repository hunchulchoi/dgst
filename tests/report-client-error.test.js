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
    globalThis.fetch = /** @type {typeof fetch} */ (/** @type {unknown} */ (vi.fn(() => logPost)));
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
  it('sends structured details in the log payload', () => {
    const originalFetch = globalThis.fetch;
    const originalLocation = globalThis.location;
    const originalNavigator = globalThis.navigator;
    const logPost = { catch: vi.fn() };
    /** @type {RequestInit | undefined} */
    let capturedInit;
    const fetchMock = vi.fn((_, init) => {
      capturedInit = init;
      return logPost;
    });
    globalThis.fetch = /** @type {typeof fetch} */ (/** @type {unknown} */ (fetchMock));
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: {
        href: 'https://www.dgst.me/board/free/write/abc',
        pathname: '/board/free/write/abc',
        search: ''
      }
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { userAgent: 'vitest', platform: 'test', language: 'ko-KR' }
    });

    try {
      reportClientError(new Error('Minified Lexical error #282'), {
        type: 'lexical-editor-error',
        phase: 'lexical-editor-runtime',
        details: {
          lexicalErrorCode: '282',
          rootElementAudioCount: 1
        }
      });

      const body = JSON.parse(String(capturedInit?.body ?? '{}'));
      expect(body.details).toMatchObject({
        lexicalErrorCode: '282',
        rootElementAudioCount: 1
      });
      expect(body.phase).toBe('lexical-editor-runtime');
    } finally {
      globalThis.fetch = originalFetch;
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

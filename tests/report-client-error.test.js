import { describe, expect, it, vi } from 'vitest';

import {
  isExternalSerialPortError,
  reportClientError,
  reportClientPageError
} from '../src/lib/util/reportClientPageError.js';

describe('isExternalSerialPortError', () => {
  it('matches the injected Web Serial open failure', () => {
    expect(
      isExternalSerialPortError({
        name: 'NetworkError',
        message: "Failed to execute 'open' on 'SerialPort': Failed to open serial port."
      })
    ).toBe(true);
  });

  it('does not hide unrelated network errors', () => {
    expect(isExternalSerialPortError(new DOMException('Failed to fetch', 'NetworkError'))).toBe(
      false
    );
  });
});

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

describe('reportClientPageError', () => {
  it('adds page-error shape and browser state for diagnosing opaque Internal Error responses', () => {
    const originalFetch = globalThis.fetch;
    const originalLocation = globalThis.location;
    const originalNavigator = globalThis.navigator;
    const originalDocument = globalThis.document;
    const originalWindow = globalThis.window;
    const logPost = { catch: vi.fn() };
    /** @type {RequestInit | undefined} */
    let capturedInit;
    globalThis.fetch = /** @type {typeof fetch} */ (
      /** @type {unknown} */ (
        vi.fn((_, init) => {
          capturedInit = init;
          return logPost;
        })
      )
    );
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { href: 'https://www.dgst.me/', pathname: '/', search: '' }
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        userAgent: 'KAKAOTALK/26.6.1',
        platform: 'Linux aarch64',
        language: 'ko-KR',
        onLine: true,
        hardwareConcurrency: 8,
        connection: { effectiveType: '4g', rtt: 80, downlink: 10, saveData: false }
      }
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { referrer: '', readyState: 'complete', visibilityState: 'visible' }
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        innerWidth: 384,
        innerHeight: 748,
        devicePixelRatio: 2.75,
        screen: { width: 384, height: 854 },
        history: { length: 2 }
      }
    });

    try {
      const pageError = { message: 'Internal Error', errorId: 'server-error-id' };
      reportClientPageError({
        status: 500,
        pathname: '/',
        routeId: '/',
        error: pageError
      });

      const body = JSON.parse(String(capturedInit?.body ?? '{}'));
      expect(body.errorId).toBe('server-error-id');
      expect(body.message).toContain('errorId=server-error-id');
      expect(body.details).toMatchObject({
        pageErrorKeys: ['errorId', 'message'],
        pageErrorHasStack: false,
        documentReadyState: 'complete',
        visibilityState: 'visible',
        online: true,
        effectiveType: '4g',
        connectionRttMs: 80,
        screen: '384x854',
        pixelRatio: 2.75,
        historyLength: 2
      });
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
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: originalDocument
      });
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow
      });
    }
  });
});

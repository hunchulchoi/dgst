import { describe, expect, it, vi } from 'vitest';

import {
  createClientErrorFingerprint,
  isExternalSerialPortError,
  reportClientError,
  reportClientPageError
} from '../src/lib/util/reportClientPageError.js';
import {
  getClientEventTrace,
  recordClientNavigationComplete,
  recordClientNavigationStart,
  resetClientNavigationContext,
  setClientNavigationOperation
} from '../src/lib/util/clientNavigationContext.js';
import { handleError as handleClientError } from '../src/hooks.client.js';

describe('client error fingerprint', () => {
  it('groups the same minified failure across changing asset hashes and line numbers', () => {
    const first = Object.assign(new Error('Failed in chunk abcdef123456'), {
      stack:
        'Error: Failed in chunk abcdef123456\n at render (https://www.dgst.me/a-12345678.js:10:20)'
    });
    const second = Object.assign(new Error('Failed in chunk fedcba654321'), {
      stack:
        'Error: Failed in chunk fedcba654321\n at render (https://www.dgst.me/a-87654321.js:99:4)'
    });
    const context = { routeId: '/', phase: 'client-handle-error', component: 'route:/' };

    expect(createClientErrorFingerprint(first, context)).toBe(
      createClientErrorFingerprint(second, context)
    );
  });
});

describe('hooks.client handleError', () => {
  it('captures the original render error before SvelteKit exposes Internal Error', () => {
    const originalFetch = globalThis.fetch;
    const originalConsoleError = console.error;
    const originalLocation = globalThis.location;
    /** @type {RequestInit | undefined} */
    let capturedInit;
    const logPost = { catch: vi.fn() };
    globalThis.fetch = /** @type {typeof fetch} */ (
      /** @type {unknown} */ (
        vi.fn((_, init) => {
          capturedInit = init;
          return logPost;
        })
      )
    );
    console.error = vi.fn();
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { pathname: '/board/alarm' }
    });

    try {
      setClientNavigationOperation('free-board-home-navigation');
      recordClientNavigationStart({
        fromPath: '/board/alarm',
        toPath: '/',
        fromRouteId: '/board/alarm',
        toRouteId: '/',
        type: 'link'
      });
      const cause = new Error('nested render cause');
      const error = new Error('root render failed', { cause });
      const appError = /** @type {{ message?: string, errorId?: string, fingerprint?: string }} */ (
        handleClientError({
          error,
          status: 500,
          message: 'Internal Error',
          event: {
            url: new URL('https://www.dgst.me/?alarm=private-alarm-id'),
            params: {},
            route: { id: '/' }
          }
        })
      );

      const body = JSON.parse(String(capturedInit?.body ?? '{}'));
      expect(appError).toMatchObject({
        message: 'Internal Error',
        errorId: expect.any(String),
        fingerprint: expect.stringMatching(/^ce-/)
      });
      expect(body).toMatchObject({
        type: 'sveltekit-client-error',
        errorMessage: 'root render failed',
        cause: 'Error: nested render cause',
        routeId: '/',
        currentPath: '/board/alarm',
        previousPath: '/board/alarm',
        operation: 'free-board-home-navigation',
        component: 'route:/'
      });
      expect(body.trace).toContain('root render failed');
      expect(body.errorId).toBe(appError.errorId);
      expect(body.fingerprint).toBe(appError.fingerprint);
      expect(body.buildVersion).toEqual(expect.any(String));
      expect(body.details).toMatchObject({
        navigationFrom: '/board/alarm',
        navigationTo: '/',
        navigationType: 'link',
        navigationActive: true
      });
      expect(body.details).not.toHaveProperty('clientEventTrace');
      expect(JSON.stringify(body)).not.toContain('private-alarm-id');
      expect(body).not.toHaveProperty('href');
      expect(body).not.toHaveProperty('search');
      expect(body).not.toHaveProperty('referer');
    } finally {
      resetClientNavigationContext();
      globalThis.fetch = originalFetch;
      console.error = originalConsoleError;
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: originalLocation
      });
    }
  });

  it('attaches buffered navigation events only to interrupted fetch errors', () => {
    const originalFetch = globalThis.fetch;
    const originalConsoleError = console.error;
    const originalLocation = globalThis.location;
    /** @type {RequestInit | undefined} */
    let capturedInit;
    globalThis.fetch = /** @type {typeof fetch} */ (
      /** @type {unknown} */ (
        vi.fn((_, init) => {
          capturedInit = init;
          return { catch: vi.fn() };
        })
      )
    );
    console.error = vi.fn();
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { pathname: '/' }
    });

    try {
      recordClientNavigationStart({ fromPath: '/board/free', toPath: '/', type: 'popstate' });
      handleClientError({
        error: new TypeError('Failed to fetch'),
        status: 500,
        message: 'Internal Error',
        event: { url: new URL('https://www.dgst.me/'), params: {}, route: { id: '/' } }
      });

      const body = JSON.parse(String(capturedInit?.body ?? '{}'));
      expect(body.details.clientEventTrace).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event: 'navigation-start',
            fromPath: '/board/free',
            toPath: '/',
            navigationType: 'popstate'
          })
        ])
      );
    } finally {
      resetClientNavigationContext();
      globalThis.fetch = originalFetch;
      console.error = originalConsoleError;
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: originalLocation
      });
    }
  });
});

describe('client navigation event trace', () => {
  it('keeps only the latest 16 in-memory events without query values', () => {
    resetClientNavigationContext();

    for (let index = 0; index < 10; index += 1) {
      recordClientNavigationStart({
        fromPath: `/from/${index}?secret=value`,
        toPath: `/to/${index}?secret=value`,
        type: 'link'
      });
      recordClientNavigationComplete({ path: `/to/${index}` });
    }

    const trace = getClientEventTrace();
    expect(trace).toHaveLength(16);
    expect(JSON.stringify(trace)).not.toContain('secret');
    expect(trace.at(-1)).toMatchObject({ event: 'navigation-complete', toPath: '/to/9' });
    resetClientNavigationContext();
  });
});

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

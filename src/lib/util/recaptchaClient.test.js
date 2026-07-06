import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRecaptchaToken } from './recaptchaClient.js';

/**
 * @typedef {{ ready: (callback: () => void) => void; execute: (siteKey: string, options: { action: string }) => Promise<string> }} Grecaptcha
 */

/**
 * @param {Grecaptcha | undefined} [grecaptcha]
 */
function installWindow(grecaptcha) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: /** @type {Window & typeof globalThis & { grecaptcha?: Grecaptcha }} */ ({ grecaptcha })
  });
}

describe('getRecaptchaToken', () => {
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('reads window.grecaptcha when a token is requested', async () => {
    const execute = vi.fn().mockResolvedValue('token-123');
    installWindow({
      ready: (callback) => callback(),
      execute
    });

    await expect(getRecaptchaToken('site-key')).resolves.toBe('token-123');
    expect(execute).toHaveBeenCalledWith('site-key', { action: 'register' });
  });

  it('waits for grecaptcha to become available', async () => {
    vi.useFakeTimers();
    const execute = vi.fn().mockResolvedValue('late-token');
    installWindow();

    const tokenPromise = getRecaptchaToken('site-key');

    setTimeout(() => {
      const browserWindow =
        /** @type {Window & typeof globalThis & { grecaptcha?: Grecaptcha }} */ (
          globalThis.window
        );
      browserWindow.grecaptcha = {
        ready: (callback) => callback(),
        execute
      };
    }, 200);

    await vi.advanceTimersByTimeAsync(200);

    await expect(tokenPromise).resolves.toBe('late-token');
  });
});

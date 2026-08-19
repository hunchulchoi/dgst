import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForTurnstile } from './turnstileClient.js';

/** @typedef {ReturnType<typeof createTurnstile>} TurnstileMock */

/** @param {TurnstileMock | undefined} turnstile */
function installWindow(turnstile) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: /** @type {Window & typeof globalThis & { turnstile?: TurnstileMock }} */ (
      /** @type {unknown} */ ({ turnstile })
    )
  });
}

function createTurnstile() {
  return {
    render: vi.fn(),
    reset: vi.fn(),
    remove: vi.fn()
  };
}

describe('waitForTurnstile', () => {
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('returns the loaded Turnstile API', async () => {
    const turnstile = createTurnstile();
    installWindow(turnstile);

    await expect(waitForTurnstile()).resolves.toBe(turnstile);
  });

  it('waits for the Turnstile script to load', async () => {
    vi.useFakeTimers();
    installWindow(undefined);
    const turnstile = createTurnstile();
    const result = waitForTurnstile();

    setTimeout(() => {
      const browserWindow =
        /** @type {Window & typeof globalThis & { turnstile?: TurnstileMock }} */ (
          globalThis.window
        );
      browserWindow.turnstile = turnstile;
    }, 200);

    await vi.advanceTimersByTimeAsync(200);
    await expect(result).resolves.toBe(turnstile);
  });
});

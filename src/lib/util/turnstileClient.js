/**
 * @typedef {{
 *   render: (container: HTMLElement, options: Record<string, unknown>) => string,
 *   reset: (widgetId: string) => void,
 *   remove: (widgetId: string) => void
 * }} Turnstile
 */

const TURNSTILE_LOAD_TIMEOUT_MS = 5000;
const TURNSTILE_LOAD_POLL_MS = 100;

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** @returns {Turnstile | undefined} */
function readTurnstile() {
  if (typeof window === 'undefined') return undefined;
  return /** @type {Window & { turnstile?: Turnstile }} */ (window).turnstile;
}

/** @returns {Promise<Turnstile>} */
export async function waitForTurnstile() {
  const deadline = Date.now() + TURNSTILE_LOAD_TIMEOUT_MS;

  while (Date.now() <= deadline) {
    const turnstile = readTurnstile();
    if (
      turnstile &&
      typeof turnstile.render === 'function' &&
      typeof turnstile.reset === 'function' &&
      typeof turnstile.remove === 'function'
    ) {
      return turnstile;
    }
    await sleep(TURNSTILE_LOAD_POLL_MS);
  }

  throw new Error('Turnstile not loaded');
}

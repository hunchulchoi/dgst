/**
 * @typedef {{ ready: (callback: () => void) => void; execute: (siteKey: string, options: { action: string }) => Promise<string> }} Grecaptcha
 */

const RECAPTCHA_LOAD_TIMEOUT_MS = 5000;
const RECAPTCHA_LOAD_POLL_MS = 100;

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @returns {Grecaptcha | undefined}
 */
function readGrecaptcha() {
  if (typeof window === 'undefined') return undefined;
  return /** @type {Window & { grecaptcha?: Grecaptcha }} */ (window).grecaptcha;
}

/**
 * @returns {Promise<Grecaptcha>}
 */
async function waitForGrecaptcha() {
  const deadline = Date.now() + RECAPTCHA_LOAD_TIMEOUT_MS;

  while (Date.now() <= deadline) {
    const grecaptcha = readGrecaptcha();
    if (
      grecaptcha &&
      typeof grecaptcha.ready === 'function' &&
      typeof grecaptcha.execute === 'function'
    ) {
      return grecaptcha;
    }

    await sleep(RECAPTCHA_LOAD_POLL_MS);
  }

  throw new Error('reCAPTCHA not loaded');
}

/**
 * @param {string} siteKey
 * @param {string} [action]
 * @returns {Promise<string>}
 */
export async function getRecaptchaToken(siteKey, action = 'register') {
  if (!siteKey) {
    throw new Error('reCAPTCHA site key missing');
  }

  const grecaptcha = await waitForGrecaptcha();

  return new Promise((resolve, reject) => {
    grecaptcha.ready(() => {
      grecaptcha.execute(siteKey, { action }).then(resolve).catch(reject);
    });
  });
}

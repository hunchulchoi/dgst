import { createHmac, randomBytes } from 'node:crypto';

const TTL_MS = 15 * 60 * 1000;
const MAX_SUCCESSES = 1000;
const ERROR_TYPES = new Set([
  'InvalidCheck',
  'CallbackRouteError',
  'AdapterError',
  'SessionTokenError',
  'AccessDenied',
  'OAuthAccountNotLinked',
  'OAuthCallbackError',
  'OAuthSignInError',
  'MissingSecret',
  'UntrustedHost',
  'JWTSessionError',
  'MissingCSRF'
]);

/** @param {unknown} value @returns {Record<string, unknown>} */
function record(value) {
  return value && typeof value === 'object' ? /** @type {Record<string, unknown>} */ (value) : {};
}

/** Read only known error categories; never serialize error messages, cookies or tokens.
 * @param {unknown} error
 * @param {boolean | undefined} hasPkceCookie
 */
export function summarizeAuthError(error, hasPkceCookie) {
  const root = record(error);
  const errorType = ERROR_TYPES.has(String(root.type)) ? String(root.type) : 'UnknownAuthError';
  const check =
    typeof root.message === 'string' && root.message.includes('pkceCodeVerifier')
      ? 'pkce'
      : 'other';
  let reason = 'unknown';
  let current = root;
  const seen = new Set();
  for (let depth = 0; depth < 8 && !seen.has(current); depth++) {
    seen.add(current);
    const message = typeof current.message === 'string' ? current.message : '';
    if (current.name === 'JWTExpired') reason = 'expired';
    else if (current.name === 'JWEDecryptionFailed') reason = 'decryption-failed';
    else if (current.name === 'JWTInvalid' || current.name === 'JWEInvalid') reason = 'malformed';
    else if (message.includes('cookie was missing')) reason = 'cookie-missing';
    else if (message.includes('cookie was created for a different provider'))
      reason = 'provider-mismatch';
    else if (message.includes('"iss" (issuer) missing')) reason = 'issuer-missing';
    const cause = record(current.cause);
    current = record(cause.err ?? current.cause);
  }
  if (errorType === 'InvalidCheck' && reason === 'unknown') {
    reason = check === 'pkce' && hasPkceCookie === false ? 'cookie-missing' : 'invalid-check';
  }
  return { errorType, reason, check };
}

/**
 * Request-local diagnostics and bounded, process-local evidence of completed callbacks.
 * Fingerprints are keyed hashes and are never emitted. This never accepts a replay.
 * @param {{ error: (entry: object) => unknown, warn: (entry: object) => unknown, info: (entry: object) => unknown }} logger
 * @param {() => number} [now]
 */
export function createAuthDiagnostics(logger, now = Date.now) {
  const secret = randomBytes(32);
  /** @type {Map<string, number>} */
  const successes = new Map();
  /** @type {WeakMap<object, { provider: string, pathname: string, hasPkceCookie: boolean, fingerprint?: string, errorType?: string, reason?: string, classification?: string }>} */
  const requests = new WeakMap();

  /** @param {import('@sveltejs/kit').RequestEvent} event */
  function begin(event) {
    const { pathname } = event.url;
    if (!/^\/auth\/callback\/(google|kakao)$/.test(pathname)) return;
    const provider = pathname.split('/').pop() || 'unknown';
    const code = event.url.searchParams.get('code');
    const fingerprint =
      code && code.length <= 4096
        ? createHmac('sha256', secret)
            .update(JSON.stringify([event.url.origin, pathname, code]))
            .digest('hex')
        : undefined;
    requests.set(event, {
      provider,
      pathname,
      fingerprint,
      hasPkceCookie: Boolean(
        event.cookies.get('__Secure-authjs.pkce.code_verifier') ||
        event.cookies.get('authjs.pkce.code_verifier')
      )
    });
    for (const [key, expires] of successes) {
      if (expires > now()) break;
      successes.delete(key);
    }
  }

  /** @param {unknown} error @param {import('@sveltejs/kit').RequestEvent | undefined} event */
  function logError(error, event) {
    const context = event ? requests.get(event) : undefined;
    const summary = summarizeAuthError(error, context?.hasPkceCookie);
    const replay =
      summary.check === 'pkce' &&
      summary.errorType === 'InvalidCheck' &&
      summary.reason === 'cookie-missing' &&
      Boolean(context?.fingerprint && (successes.get(context.fingerprint) ?? 0) > now());
    const denied =
      summary.errorType === 'CallbackRouteError' &&
      event?.url.searchParams.get('error') === 'access_denied';
    const classification = replay ? 'replayed' : denied ? 'denied' : 'failed';
    if (context) Object.assign(context, summary, { classification });
    const entry = {
      message: 'Auth.js request diagnostic',
      event: replay ? 'auth.callback.replayed' : denied ? 'auth.signin.denied' : 'auth.error',
      ...summary,
      ...(context
        ? {
            provider: context.provider,
            pathname: context.pathname,
            hasPkceCookie: context.hasPkceCookie
          }
        : {})
    };
    if (replay) logger.info(entry);
    else if (denied) logger.warn(entry);
    else logger.error(entry);
  }

  /** Call only after the issued session has been resolved to a user.
   * @param {import('@sveltejs/kit').RequestEvent} event
   */
  function success(event) {
    const context = requests.get(event);
    const fingerprint = context?.fingerprint;
    if (!fingerprint) return;
    successes.delete(fingerprint);
    successes.set(fingerprint, now() + TTL_MS);
    if (successes.size > MAX_SUCCESSES) {
      const first = successes.keys().next().value;
      if (first) successes.delete(first);
    }
    logger.info({
      message: 'Auth callback issued a verified session',
      event: 'auth.signin.succeeded',
      provider: context.provider,
      pathname: context.pathname
    });
  }

  /** @param {import('@sveltejs/kit').RequestEvent} event */
  function failure(event) {
    const context = requests.get(event);
    return {
      classification: context?.classification ?? 'failed',
      authErrorType: context?.errorType,
      reason: context?.reason,
      hasPkceCookie: context?.hasPkceCookie
    };
  }
  return { begin, logError, success, failure };
}

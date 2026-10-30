const COOKIE_NAME = 'dgst.auth-recovery';
const COOKIE_OPTIONS = { path: '/login', httpOnly: true, sameSite: /** @type {const} */ ('lax') };

/** This short-lived UI hint never authorizes a session or bypasses OAuth checks.
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {{ authErrorType?: string, check?: string, reason?: string, classification?: string }} failure
 * @param {Response} response
 */
export function offerSignInRecovery(event, failure, response) {
  const provider = event.url.pathname.split('/').pop();
  if (
    !['google', 'kakao'].includes(provider || '') ||
    failure.authErrorType !== 'InvalidCheck' ||
    failure.check !== 'pkce' ||
    failure.classification !== 'failed' ||
    !['cookie-missing', 'expired'].includes(failure.reason || '')
  )
    return response;
  // Auth.js returns its own Response without resolve(), so SvelteKit does not append
  // cookies.set() changes here. Attach the UI hint to that response explicitly.
  const cookie = event.cookies.serialize(
    COOKIE_NAME,
    JSON.stringify({ provider, reason: failure.reason }),
    {
      ...COOKIE_OPTIONS,
      secure: event.url.protocol === 'https:',
      maxAge: 120
    }
  );
  const headers = new Headers(response.headers);
  headers.append('set-cookie', cookie);
  headers.set('cache-control', 'no-store');
  headers.set('referrer-policy', 'no-referrer');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

/** Consume once; query parameters alone must never trigger automatic recovery.
 * @param {import('@sveltejs/kit').Cookies} cookies
 * @param {string | null} error
 * @returns {{ provider: 'google' | 'kakao', reason: 'cookie-missing' | 'expired' } | null}
 */
export function takeSignInRecovery(cookies, error) {
  const value = cookies.get(COOKIE_NAME);
  if (!value) return null;
  cookies.delete(COOKIE_NAME, COOKIE_OPTIONS);
  if (error !== 'Configuration' || value.length > 200) return null;
  try {
    const hint = JSON.parse(value);
    if (
      ['google', 'kakao'].includes(hint?.provider) &&
      ['cookie-missing', 'expired'].includes(hint?.reason)
    )
      return hint;
  } catch {
    // A damaged hint falls back to the regular login buttons.
  }
  return null;
}

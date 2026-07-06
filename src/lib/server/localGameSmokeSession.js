import { env } from '$env/dynamic/private';

const SMOKE_USER = {
  email: 'local-game-smoke@dgst.local',
  nickname: '로컬스모크',
  name: '로컬스모크'
};

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

/**
 * @param {string | null | undefined} value
 */
function normalizeHostname(value) {
  const raw = (value ?? '').split(',')[0].trim().toLowerCase();
  if (!raw) return '';
  if (raw.startsWith('[')) return raw.slice(1, raw.indexOf(']'));
  return raw.split(':')[0];
}

/**
 * @param {string | null | undefined} hostname
 */
function isLocalHostname(hostname) {
  const normalized = normalizeHostname(hostname);
  return LOCAL_HOSTNAMES.has(normalized) || normalized.endsWith('.localhost');
}

/**
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
export function isLocalGameSmokeSessionEnabled(event) {
  const flag = String(env.DGST_LOCAL_GAME_SMOKE ?? '').toLowerCase();
  const nodeEnv =
    env.NODE_ENV ?? (typeof process !== 'undefined' ? process.env.NODE_ENV : undefined);
  if (!['1', 'true', 'yes', 'on'].includes(flag)) return false;
  if (nodeEnv === 'production') return false;

  return [
    event.url.hostname,
    event.request.headers.get('host'),
    event.request.headers.get('x-forwarded-host')
  ].some(isLocalHostname);
}

/**
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @returns {import('@auth/sveltekit').Session | null}
 */
export function getLocalGameSmokeSession(event) {
  if (!isLocalGameSmokeSessionEnabled(event)) return null;
  return {
    user: SMOKE_USER,
    expires: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  };
}

/**
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @returns {Promise<import('@auth/sveltekit').Session | null>}
 */
export async function getGameSession(event) {
  return (await event.locals.auth()) ?? getLocalGameSmokeSession(event);
}

/**
 * @param {unknown} session
 */
export function isLocalGameSmokeSession(session) {
  if (!session || typeof session !== 'object' || !('user' in session)) return false;
  return /** @type {{ user?: { email?: unknown } }} */ (session).user?.email === SMOKE_USER.email;
}

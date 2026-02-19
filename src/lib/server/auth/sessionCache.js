/**
 * 세션+유저 Redis 캐시: getSessionAndUser 호출 시 Redis 우선, 미스 시 MongoDB 조회 후 캐시.
 * TTL로만 만료 (프로필 수정 시 userCache.invalidateUser로 유저 캐시는 무효화되나, 세션 캐시는 TTL로 갱신).
 */
import * as redis from '$lib/server/redis/client.js';

const SESSION_PREFIX = 'session:';
const SESSION_CACHE_TTL = 300; // 5분

const USER_DATE_KEYS = ['emailVerified', 'created_at', 'last_modified', 'latest_login_at'];
const SESSION_DATE_KEYS = ['expires'];

/**
 * @param {Record<string, unknown>} obj
 * @param {string[]} dateKeys
 */
function reviveDates(obj, dateKeys) {
  if (!obj || typeof obj !== 'object') return;
  for (const k of dateKeys) {
    const v = obj[k];
    if (typeof v === 'string') obj[k] = new Date(v);
  }
}

/**
 * @param {string} sessionToken
 * @returns {Promise<{ session: import('@auth/core/adapters').AdapterSession; user: import('@auth/core/adapters').AdapterUser } | null>}
 */
export async function getCachedSessionAndUser(sessionToken) {
  const raw = await redis.getJson(SESSION_PREFIX + sessionToken);
  if (!raw?.session || !raw?.user) return null;
  reviveDates(raw.session, SESSION_DATE_KEYS);
  reviveDates(raw.user, USER_DATE_KEYS);
  return { session: raw.session, user: raw.user };
}

/**
 * @param {string} sessionToken
 * @param {{ session: import('@auth/core/adapters').AdapterSession; user: import('@auth/core/adapters').AdapterUser }} data
 * @param {number} [ttlSeconds]
 */
export async function setCachedSessionAndUser(sessionToken, data, ttlSeconds = SESSION_CACHE_TTL) {
  const payload = {
    session: { ...data.session },
    user: { ...data.user }
  };
  if (payload.session.expires instanceof Date) payload.session.expires = payload.session.expires.toISOString();
  for (const k of USER_DATE_KEYS) {
    if (payload.user[k] instanceof Date) payload.user[k] = payload.user[k].toISOString();
  }
  return redis.setJson(SESSION_PREFIX + sessionToken, payload, ttlSeconds);
}

/**
 * 세션 삭제/로그아웃 시 캐시 제거 (선택). TTL로도 자연 만료됨.
 * @param {string} sessionToken
 */
export async function invalidateSession(sessionToken) {
  return redis.del(SESSION_PREFIX + sessionToken);
}

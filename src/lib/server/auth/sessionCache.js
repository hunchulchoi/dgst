/**
 * 세션+유저 pgCache: getSessionAndUser 호출 시 캐시 우선, 미스 시 DB 조회 후 캐시.
 * TTL로만 만료 (프로필 수정 시 userCache.invalidateUser로 유저 캐시는 무효화되나, 세션 캐시는 TTL로 갱신).
 */
import * as pgCache from '$lib/server/cache/pgCache.js';
import { USER_DATE_KEYS, reviveDates } from '$lib/server/auth/userCache.js';
import { getPrisma } from '$lib/database/prisma.js';
import logger from '$lib/util/logger.js';

const NAMESPACE = 'session';
const SESSION_PREFIX = 'session:';
const SESSION_CACHE_TTL = 300; // 5분

const SESSION_DATE_KEYS = ['expires'];

/**
 * @param {string} sessionToken
 * @returns {Promise<{ session: import('@auth/core/adapters').AdapterSession; user: import('@auth/core/adapters').AdapterUser } | null>}
 */
export async function getCachedSessionAndUser(sessionToken) {
  const raw =
    /** @type {{ session?: Record<string, unknown>; user?: Record<string, unknown> } | null} */ (
      await pgCache.getJson(SESSION_PREFIX + sessionToken, NAMESPACE)
    );
  if (!raw?.session || !raw?.user) return null;
  reviveDates(raw.session, SESSION_DATE_KEYS);
  reviveDates(raw.user, USER_DATE_KEYS);
  return {
    session: /** @type {import('@auth/core/adapters').AdapterSession} */ (
      /** @type {unknown} */ (raw.session)
    ),
    user: /** @type {import('@auth/core/adapters').AdapterUser} */ (
      /** @type {unknown} */ (raw.user)
    )
  };
}

/**
 * @param {string} sessionToken
 * @param {{ session: import('@auth/core/adapters').AdapterSession; user: import('@auth/core/adapters').AdapterUser }} data
 * @param {number} [ttlSeconds]
 */
export async function setCachedSessionAndUser(sessionToken, data, ttlSeconds = SESSION_CACHE_TTL) {
  const payload = {
    session: /** @type {Record<string, unknown>} */ ({ ...data.session }),
    user: /** @type {Record<string, unknown>} */ ({ ...data.user })
  };
  if (payload.session.expires instanceof Date)
    payload.session.expires = payload.session.expires.toISOString();
  for (const k of USER_DATE_KEYS) {
    if (payload.user[k] instanceof Date) payload.user[k] = payload.user[k].toISOString();
  }
  return pgCache.setJson(SESSION_PREFIX + sessionToken, payload, ttlSeconds, NAMESPACE);
}

/**
 * 세션 삭제/로그아웃 시 캐시 제거 (선택). TTL로도 자연 만료됨.
 * @param {string} sessionToken
 */
export async function invalidateSession(sessionToken) {
  return pgCache.del(SESSION_PREFIX + sessionToken, NAMESPACE);
}

/**
 * 유저 정보/상태 변경 시 해당 유저의 세션 조회 캐시를 모두 비웁니다.
 * @param {string} userId
 */
export async function invalidateSessionsForUser(userId) {
  try {
    const sessions = await getPrisma().session.findMany({
      where: { userId },
      select: { sessionToken: true }
    });
    await Promise.all(sessions.map((session) => invalidateSession(session.sessionToken)));
    return true;
  } catch (err) {
    logger.warn({
      message: '[auth] invalidateSessionsForUser failed',
      userId,
      error: String(err)
    });
    return false;
  }
}

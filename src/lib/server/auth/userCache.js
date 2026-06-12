/**
 * 회원정보(User) pgCache: 조회 시 캐시 우선, 미스 시 DB 조회 후 캐시.
 * 무효화: updateUser 시 user:id 삭제.
 */
import * as pgCache from '$lib/server/cache/pgCache.js';

const NAMESPACE = 'user';
const USER_ID_PREFIX = 'user:id:';
const USER_EMAIL_PREFIX = 'user:email:';
const USER_CACHE_TTL = 1800; // 30분

/** @type {readonly string[]} */
export const USER_DATE_KEYS = ['emailVerified', 'createdAt', 'lastModified', 'latestLoginAt'];

/**
 * @param {Record<string, unknown>} obj
 * @param {readonly string[]} dateKeys
 */
export function reviveDates(obj, dateKeys) {
  if (!obj || typeof obj !== 'object') return;
  for (const k of dateKeys) {
    const v = obj[k];
    if (typeof v === 'string') obj[k] = new Date(v);
  }
}

/**
 * @param {Record<string, unknown>} obj
 * @param {readonly string[]} dateKeys
 */
function serializeDates(obj, dateKeys) {
  const payload = { ...obj };
  for (const k of dateKeys) {
    if (payload[k] instanceof Date) payload[k] = payload[k].toISOString();
  }
  return payload;
}

/**
 * @param {string} id
 * @returns {Promise<import('@auth/core/adapters').AdapterUser | null>}
 */
export async function getCachedUserById(id) {
  const raw = await pgCache.getJson(USER_ID_PREFIX + id, NAMESPACE);
  if (!raw) return null;
  reviveDates(raw, USER_DATE_KEYS);
  return raw;
}

/**
 * @param {string} email
 * @returns {Promise<import('@auth/core/adapters').AdapterUser | null>}
 */
export async function getCachedUserByEmail(email) {
  const raw = await pgCache.getJson(USER_EMAIL_PREFIX + email, NAMESPACE);
  if (!raw) return null;
  reviveDates(raw, USER_DATE_KEYS);
  return raw;
}

/**
 * @param {import('@auth/core/adapters').AdapterUser} user
 */
export async function setCachedUser(user) {
  if (!user?.id) return;
  const payload = serializeDates(user, USER_DATE_KEYS);
  await pgCache.setJson(USER_ID_PREFIX + user.id, payload, USER_CACHE_TTL, NAMESPACE);
  if (user.email)
    await pgCache.setJson(USER_EMAIL_PREFIX + user.email, payload, USER_CACHE_TTL, NAMESPACE);
}

/**
 * updateUser 등으로 사용자 변경 시 캐시 무효화.
 * 프로필 수정 등 DB에서 직접 사용자 갱신 시에도 호출 권장.
 * @param {string} userId
 * @param {string} [email] 알려진 이메일이 있으면 email 키도 함께 삭제
 */
export async function invalidateUser(userId, email) {
  let emailToInvalidate = email;
  if (!emailToInvalidate) {
    const cached = await pgCache.getJson(USER_ID_PREFIX + userId, NAMESPACE);
    if (cached?.email) emailToInvalidate = cached.email;
  }
  await pgCache.del(USER_ID_PREFIX + userId, NAMESPACE);
  if (emailToInvalidate) {
    await pgCache.del(USER_EMAIL_PREFIX + emailToInvalidate, NAMESPACE);
  }
}

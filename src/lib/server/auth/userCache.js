/**
 * 회원정보(User) Redis 캐시: 조회 시 Redis 우선, 미스 시 MongoDB 조회 후 캐시.
 * 무효화: updateUser 시 user:id 삭제.
 */
import * as redis from '$lib/server/redis/client.js';

const USER_ID_PREFIX = 'user:id:';
const USER_EMAIL_PREFIX = 'user:email:';
const USER_CACHE_TTL = 1800; // 30분

/**
 * @param {string} id
 * @returns {Promise<import('@auth/core/adapters').AdapterUser | null>}
 */
export async function getCachedUserById(id) {
  const raw = await redis.getJson(USER_ID_PREFIX + id);
  if (!raw) return null;
  if (raw.emailVerified) raw.emailVerified = new Date(raw.emailVerified);
  return raw;
}

/**
 * @param {string} email
 * @returns {Promise<import('@auth/core/adapters').AdapterUser | null>}
 */
export async function getCachedUserByEmail(email) {
  const raw = await redis.getJson(USER_EMAIL_PREFIX + email);
  if (!raw) return null;
  if (raw.emailVerified) raw.emailVerified = new Date(raw.emailVerified);
  return raw;
}

/**
 * @param {import('@auth/core/adapters').AdapterUser} user
 */
export async function setCachedUser(user) {
  if (!user?.id) return;
  const payload = { ...user };
  if (payload.emailVerified instanceof Date)
    payload.emailVerified = payload.emailVerified.toISOString();
  await redis.setJson(USER_ID_PREFIX + user.id, payload, USER_CACHE_TTL);
  if (user.email) await redis.setJson(USER_EMAIL_PREFIX + user.email, payload, USER_CACHE_TTL);
}

/**
 * updateUser 등으로 사용자 변경 시 캐시 무효화.
 * 프로필 수정 등 MongoDB에서 직접 사용자 갱신 시에도 호출 권장.
 * @param {string} userId
 */
export async function invalidateUser(userId) {
  await redis.del(USER_ID_PREFIX + userId);
}

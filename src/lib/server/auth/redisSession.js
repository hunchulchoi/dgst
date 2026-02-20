/**
 * Redis에 세션·검증토큰 저장/조회 (Hybrid Adapter용).
 * 키: session:<sessionToken>, vt:<identifier>:<token>
 */
import * as redis from '$lib/server/redis/client.js';

const SESSION_PREFIX = 'session:';
const VT_PREFIX = 'vt:';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30일

function sessionKey(token) {
  return SESSION_PREFIX + token;
}

function vtKey(identifier, token) {
  return VT_PREFIX + identifier + ':' + token;
}

/**
 * @param {{ sessionToken: string; userId: string; expires: Date }} data
 * @returns {Promise<{ sessionToken: string; userId: string; expires: Date } | null>}
 */
export async function createSession(data) {
  const payload = {
    sessionToken: data.sessionToken,
    userId: data.userId,
    expires: data.expires instanceof Date ? data.expires.toISOString() : data.expires
  };
  const ttl = Math.max(1, Math.floor((new Date(data.expires) - Date.now()) / 1000));
  const ok = await redis.setJson(
    sessionKey(data.sessionToken),
    payload,
    Math.min(ttl, SESSION_MAX_AGE_SECONDS)
  );
  if (!ok) return null;
  return { ...data, expires: data.expires };
}

/**
 * Redis에서 세션만 조회. Hybrid adapter에서 getUser(session.userId)와 합쳐 getSessionAndUser 구성.
 * @param {string} sessionToken
 * @returns {Promise<{ sessionToken: string; userId: string; expires: Date } | null>}
 */
export async function getSession(sessionToken) {
  const raw = await redis.getJson(sessionKey(sessionToken));
  if (!raw || !raw.userId) return null;
  return {
    sessionToken: raw.sessionToken,
    userId: raw.userId,
    expires: new Date(raw.expires)
  };
}

/**
 * @param {{ sessionToken: string } & Partial<{ userId: string; expires: Date }>} data
 * @returns {Promise<{ sessionToken: string; userId: string; expires: Date } | null>}
 */
export async function updateSession(data) {
  const existing = await getSession(data.sessionToken);
  if (!existing) return null;
  const payload = {
    sessionToken: data.sessionToken,
    userId: data.userId ?? existing.userId,
    expires:
      (data.expires ?? existing.expires) instanceof Date
        ? (data.expires ?? existing.expires).toISOString()
        : (data.expires ?? existing.expires)
  };
  const expiresDate = new Date(payload.expires);
  const ttl = Math.max(1, Math.floor((expiresDate - Date.now()) / 1000));
  const ok = await redis.setJson(
    sessionKey(data.sessionToken),
    payload,
    Math.min(ttl, SESSION_MAX_AGE_SECONDS)
  );
  if (!ok) return null;
  return { ...payload, expires: expiresDate };
}

/**
 * @param {string} sessionToken
 * @returns {Promise<{ sessionToken: string; userId: string; expires: Date } | null>}
 */
export async function deleteSession(sessionToken) {
  const existing = await getSession(sessionToken);
  await redis.del(sessionKey(sessionToken));
  return existing;
}

/**
 * @param {{ identifier: string; token: string; expires: Date }} data
 * @returns {Promise<{ identifier: string; token: string; expires: Date } | null>}
 */
export async function createVerificationToken(data) {
  const k = vtKey(data.identifier, data.token);
  const payload = {
    identifier: data.identifier,
    token: data.token,
    expires: data.expires instanceof Date ? data.expires.toISOString() : data.expires
  };
  const ttl = Math.max(60, Math.floor((new Date(data.expires) - Date.now()) / 1000));
  const ok = await redis.setJson(k, payload, ttl);
  return ok ? data : null;
}

/**
 * @param {{ identifier: string; token: string }} params
 * @returns {Promise<{ identifier: string; token: string; expires: Date } | null>}
 */
export async function useVerificationToken(params) {
  const k = vtKey(params.identifier, params.token);
  const raw = await redis.getJson(k);
  if (!raw) return null;
  await redis.del(k);
  return {
    identifier: raw.identifier,
    token: raw.token,
    expires: new Date(raw.expires)
  };
}

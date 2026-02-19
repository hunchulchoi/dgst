/**
 * Hybrid Adapter: 인증 데이터는 MongoDB, 회원정보 조회는 Redis 캐시 우선.
 * 사용자 문서에는 허용 필드만 저장하고, 불필요 필드는 저장·갱신 시 제거.
 */
import { MongoDBAdapter } from '@auth/mongodb-adapter';
import clientPromise from '$lib/database/clientPromise.js';
import * as userCache from '$lib/server/auth/userCache.js';
import * as sessionCache from '$lib/server/auth/sessionCache.js';

/** users 컬렉션에 허용하는 키만 저장 (name, image, latest_modified_at 등 제외) */
const ALLOWED_USER_KEYS = new Set([
  'id', 'email', 'nickname', 'introduction', 'photo', 'emailVerified',
  'state', 'grade', 'created_at', 'latest_login_at', 'last_modified'
]);

/** 저장 시 제거할 키 (기존 문서에서도 $unset) */
const KEYS_TO_UNSET = ['name', 'image', 'latest_modified_at'];

/** accounts 컬렉션에 허용하는 키만 저장 (토큰·scope 등 제외) */
const ALLOWED_ACCOUNT_KEYS = new Set(['userId', 'type', 'provider', 'providerAccountId']);

/** accounts에서 제거할 키 (기존 문서에서도 $unset) */
const ACCOUNT_KEYS_TO_UNSET = [
  'access_token', 'refresh_token', 'id_token', 'token_type', 'scope', 'session_state', 'expires_at'
];

/**
 * @param {Record<string, unknown>} obj
 * @returns {Record<string, unknown>}
 */
function pickAllowedUser(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const key of Object.keys(obj)) {
    if (ALLOWED_USER_KEYS.has(key)) out[key] = obj[key];
  }
  return out;
}

/**
 * @param {Record<string, unknown>} obj
 * @returns {Record<string, unknown>}
 */
function pickAllowedAccount(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const key of Object.keys(obj)) {
    if (ALLOWED_ACCOUNT_KEYS.has(key)) out[key] = obj[key];
  }
  return out;
}

/** @type {import('@auth/core/adapters').Adapter | null} */
let cachedAdapter = null;

/**
 * @param {string} databaseName - MongoDB DB 이름 (예: hooks에서 전달하는 DB_NAME)
 * @returns {import('@auth/core/adapters').Adapter}
 */
export function getHybridAdapter(databaseName) {
  if (cachedAdapter) return cachedAdapter;

  const dbName = databaseName || 'dgstdb';
  const mongo = MongoDBAdapter(clientPromise, { databaseName: dbName });

  async function getCachedUser(id) {
    const cached = await userCache.getCachedUserById(id);
    if (cached) return cached;
    const user = await mongo.getUser(id);
    if (user) await userCache.setCachedUser(user);
    return user;
  }

  async function getCachedUserByEmail(email) {
    const cached = await userCache.getCachedUserByEmail(email);
    if (cached) return cached;
    const user = await mongo.getUserByEmail(email);
    if (user) await userCache.setCachedUser(user);
    return user;
  }

  /** 기존 users 문서에서 불필요 필드 제거 */
  async function unsetUnwantedUserKeys(userId) {
    try {
      const client = await clientPromise;
      const db = client.db(dbName);
      const unset = {};
      for (const k of KEYS_TO_UNSET) unset[k] = '';
      if (Object.keys(unset).length) {
        await db.collection('users').updateOne({ id: userId }, { $unset: unset });
      }
    } catch (e) {
      console.warn('unsetUnwantedUserKeys failed', userId, e?.message);
    }
  }

  /** 기존 accounts 문서에서 토큰 등 불필요 필드 제거 (1회 실행) */
  let accountsCleaned = false;
  async function unsetUnwantedAccountKeysOnce() {
    if (accountsCleaned) return;
    accountsCleaned = true;
    try {
      const client = await clientPromise;
      const db = client.db(dbName);
      const unset = {};
      for (const k of ACCOUNT_KEYS_TO_UNSET) unset[k] = '';
      if (Object.keys(unset).length) {
        const r = await db.collection('accounts').updateMany({}, { $unset: unset });
        if (r.modifiedCount > 0) {
          console.log('[accounts] 불필요 필드 제거:', r.modifiedCount, '건');
        }
      }
    } catch (e) {
      console.warn('unsetUnwantedAccountKeys failed', e?.message);
      accountsCleaned = false;
    }
  }

  cachedAdapter = {
    async createUser(user) {
      const trimmed = pickAllowedUser(user);
      if (!trimmed.created_at) trimmed.created_at = new Date();
      if (!trimmed.last_modified) trimmed.last_modified = new Date();
      return mongo.createUser(trimmed);
    },
    getUser: getCachedUser,
    getUserByEmail: getCachedUserByEmail,
    getUserByAccount: (providerAccountId) => mongo.getUserByAccount(providerAccountId),

    async updateUser(user) {
      const trimmed = pickAllowedUser(user);
      trimmed.last_modified = new Date();
      trimmed.latest_login_at = new Date();
      const updated = await mongo.updateUser(trimmed);
      await unsetUnwantedUserKeys(user.id);
      await userCache.invalidateUser(user.id);
      return updated;
    },

    deleteUser: (id) => mongo.deleteUser(id),
    async linkAccount(account) {
      const trimmed = pickAllowedAccount(account);
      return mongo.linkAccount(trimmed);
    },
    unlinkAccount: (providerAccountId) => mongo.unlinkAccount(providerAccountId),
    // Session: Redis 캐시 우선 → 미스 시 MongoDB 조회 후 캐시 (요청마다 DB 부하 감소)
    createSession: (data) => mongo.createSession(data),
    async getSessionAndUser(sessionToken) {
      const cached = await sessionCache.getCachedSessionAndUser(sessionToken);
      if (cached) return cached;
      const result = await mongo.getSessionAndUser(sessionToken);
      if (result) await sessionCache.setCachedSessionAndUser(sessionToken, result);
      return result;
    },
    updateSession: (data) => mongo.updateSession(data),
    async deleteSession(sessionToken) {
      await sessionCache.invalidateSession(sessionToken);
      return mongo.deleteSession(sessionToken);
    },
    createVerificationToken: (data) => mongo.createVerificationToken?.(data),
    useVerificationToken: (params) => mongo.useVerificationToken?.(params)
  };

  // 첫 사용 시 기존 accounts 문서에서 토큰 등 불필요 필드 1회 제거
  unsetUnwantedAccountKeysOnce().catch(() => {});

  return cachedAdapter;
}

/**
 * Redis 클라이언트 (환경변수 REDIS_URL 기반).
 * 연결 실패/미설정 시 graceful degrade: Redis 메서드는 no-op 또는 null 반환.
 */
import Redis from 'ioredis';
import { env as dynamicEnv } from '$env/dynamic/private';
import logger from '$lib/util/logger.js';

const REDIS_URL = dynamicEnv.REDIS_URL || (typeof process !== 'undefined' ? process.env.REDIS_URL : '') || '';
const REDIS_PREFIX = (dynamicEnv.REDIS_PREFIX || (typeof process !== 'undefined' ? process.env.REDIS_PREFIX : '') || 'dgst:').toString();
const REDIS_TTL_SECONDS = parseInt(dynamicEnv.REDIS_TTL_SECONDS || '1800', 10); // 기본 30분

let client = null;
let connectPromise = null;

/**
 * @returns {Promise<Redis | null>}
 */
export async function getClient() {
  if (!REDIS_URL) {
    logger.warn(`🚨 [Redis Config] REDIS_URL 환경변수가 전혀 없어서 연결을 시도하지 않습니다! (.env 파일이나 docker-compose 설정 확인 필요)`);
    return null;
  }
  if (client) return client;
  if (connectPromise) return connectPromise;
  connectPromise = (async () => {
    try {
      const c = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          if (times > 3) return null;
          return Math.min(times * 200, 2000);
        },
        lazyConnect: true
      });
      c.on('error', (err) => {
        logger.error({ message: 'Redis connection error', error: err instanceof Error ? err.message : err });
      });
      await c.connect();
      client = c;
      return client;
    } catch (err) {
      logger.error({ message: 'Failed to initialize Redis client', error: err instanceof Error ? err.message : err });
      connectPromise = null;
      return null;
    }
  })();
  return connectPromise;
}

export function key(name) {
  return REDIS_PREFIX + name;
}

/**
 * @param {string} k
 * @returns {Promise<string | null>}
 */
export async function get(k) {
  const c = await getClient();
  if (!c) return null;
  try {
    return await c.get(key(k));
  } catch {
    return null;
  }
}

/**
 * @param {string} k
 * @param {string} v
 * @param {number} [ttlSeconds]
 * @returns {Promise<boolean>}
 */
export async function set(k, v, ttlSeconds = REDIS_TTL_SECONDS) {
  const c = await getClient();
  if (!c) return false;
  try {
    const fullKey = key(k);
    if (ttlSeconds > 0) {
      await c.setex(fullKey, ttlSeconds, v);
    } else {
      await c.set(fullKey, v);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} k
 * @returns {Promise<boolean>}
 */
export async function del(k) {
  const c = await getClient();
  if (!c) return false;
  try {
    await c.del(key(k));
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} k
 * @returns {Promise<object | null>}
 */
export async function getJson(k) {
  const raw = await get(k);
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * @param {string} k
 * @param {object} v
 * @param {number} [ttlSeconds]
 * @returns {Promise<boolean>}
 */
export async function setJson(k, v, ttlSeconds = REDIS_TTL_SECONDS) {
  try {
    return await set(k, JSON.stringify(v), ttlSeconds);
  } catch {
    return false;
  }
}

/**
 * Redis 사용 가능 여부 (연결 성공 시에만 true).
 * @returns {Promise<boolean>}
 */
export async function isAvailable() {
  const c = await getClient();
  if (!c) return false;
  try {
    await c.ping();
    return true;
  } catch {
    return false;
  }
}

export { REDIS_PREFIX, REDIS_TTL_SECONDS };

/**
 * Redis 클라이언트 (환경변수 REDIS_URL 기반).
 * 연결 실패/미설정 시 graceful degrade: Redis 메서드는 no-op 또는 null 반환.
 */
import { existsSync } from 'node:fs';
import Redis from 'ioredis';
import { REDIS_URL } from '$env/static/private';
import logger from '$lib/util/logger.js';

const REDIS_PREFIX = 'dgst:';
const REDIS_TTL_SECONDS = 1800;

/** compose 서비스명 — Docker 네트워크 DNS (container_name dgst_redis 와 별개) */
const COMPOSE_REDIS_SERVICE = 'redis';

let client = null;
let connectPromise = null;
/** 연결 불가 확정 시 재시도·타임아웃 방지 (프로세스 재시작 전까지) */
let redisDisabled = false;
let redisErrorLogged = false;

/** @returns {boolean} */
function isRunningInDocker() {
  try {
    return existsSync('/.dockerenv');
  } catch {
    return false;
  }
}

/**
 * REDIS_URL 호스트 보정.
 * - 운영·개발 공통: container_name `dgst_redis` 는 DNS에 없는 경우가 많음
 * - 앱이 Docker 안(dgst_svelte): compose 서비스명 `redis` 로 연결
 * - 앱이 호스트(같은 머신에 redis 컨테이너): 127.0.0.1:6379 (포트 매핑)
 *
 * @param {string | undefined} url
 * @returns {string | undefined}
 */
function resolveRedisUrl(url) {
  if (!url) return url;

  try {
    const parsed = new URL(url);
    const inDocker = isRunningInDocker();

    if (parsed.hostname === 'dgst_redis') {
      const targetHost = inDocker ? COMPOSE_REDIS_SERVICE : '127.0.0.1';
      logger.info({
        message: '[Redis] REDIS_URL 호스트 보정 (dgst_redis 컨테이너 → 실제 접속 주소)',
        inDocker,
        from: 'dgst_redis',
        to: targetHost
      });
      parsed.hostname = targetHost;
      return parsed.toString();
    }

    if (parsed.hostname === COMPOSE_REDIS_SERVICE && !inDocker) {
      logger.info({
        message: '[Redis] 호스트에서 실행 — redis 서비스명 대신 127.0.0.1 사용',
        from: COMPOSE_REDIS_SERVICE,
        to: '127.0.0.1'
      });
      parsed.hostname = '127.0.0.1';
      return parsed.toString();
    }
  } catch {
    return url;
  }
  return url;
}

const effectiveRedisUrl = resolveRedisUrl(REDIS_URL);

/**
 * @returns {Promise<Redis | null>}
 */
export async function getClient() {
  if (!effectiveRedisUrl) {
    if (!redisErrorLogged) {
      redisErrorLogged = true;
      logger.warn(
        '[Redis] REDIS_URL이 없어 캐시 없이 동작합니다. (.env에 redis://127.0.0.1:6379 설정 가능)'
      );
    }
    return null;
  }
  if (redisDisabled) return null;
  if (client) return client;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    try {
      const c = new Redis(effectiveRedisUrl, {
        maxRetriesPerRequest: 1,
        connectTimeout: 1500,
        enableOfflineQueue: false,
        lazyConnect: true,
        retryStrategy() {
          return null;
        }
      });
      c.on('error', (err) => {
        if (!redisErrorLogged) {
          redisErrorLogged = true;
          logger.error({
            message: 'Redis connection error',
            error: err instanceof Error ? err.message : err,
            url: effectiveRedisUrl.replace(/:[^:@/]+@/, ':***@')
          });
        }
      });
      await c.connect();
      await c.ping();
      client = c;
      return client;
    } catch (err) {
      redisDisabled = true;
      connectPromise = null;
      try {
        client?.disconnect();
      } catch {
        /* ignore */
      }
      client = null;
      if (!redisErrorLogged) {
        redisErrorLogged = true;
        logger.warn({
          message: 'Redis 연결 실패 — 캐시 없이 계속합니다',
          error: err instanceof Error ? err.message : err,
          hint:
            'Docker 앱: REDIS_URL=redis://dgst_redis:6379 또는 redis://redis:6379 (같은 compose 네트워크)'
        });
      }
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

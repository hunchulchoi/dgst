/**
 * Redis 클라이언트 (환경변수 REDIS_URL 기반).
 * 연결 실패/미설정 시 graceful degrade: Redis 메서드는 no-op 또는 null 반환.
 */
import Redis from 'ioredis';
import { REDIS_URL } from '$env/static/private';
import logger from '$lib/util/logger.js';
import {
  buildConnectionFailureLog,
  extractNetworkErrorMeta,
  redactConnectionUrl
} from '$lib/util/connectionLog.js';
import { traceFromUnknown } from '$lib/util/formatErrorTrace.js';

const REDIS_PREFIX = 'dgst:';
const REDIS_TTL_SECONDS = 1800;

let client = null;
let connectPromise = null;
let connectAttempt = 0;
let runtimeErrorCount = 0;
/** @type {number | null} */
let lastRuntimeErrorLoggedAt = null;

/**
 * @param {string} phase
 * @param {unknown} err
 * @param {Record<string, unknown>} [context]
 */
function logRedisFailure(phase, err, context = {}) {
  logger.error(
    buildConnectionFailureLog(phase, err, {
      uri: redactConnectionUrl(REDIS_URL),
      prefix: REDIS_PREFIX,
      ...context
    })
  );
}

/**
 * 반복 error 이벤트 로그 폭주 방지 (30초에 1회 상세 로그)
 *
 * @param {string} event
 * @param {unknown} err
 * @param {Record<string, unknown>} [context]
 */
function logRedisRuntimeError(event, err, context = {}) {
  runtimeErrorCount += 1;
  const now = Date.now();
  const shouldLogDetail =
    lastRuntimeErrorLoggedAt == null || now - lastRuntimeErrorLoggedAt >= 30_000;

  if (!shouldLogDetail) return;

  lastRuntimeErrorLoggedAt = now;

  logger.error({
    message: `[redis] ${event}`,
    uri: redactConnectionUrl(REDIS_URL),
    prefix: REDIS_PREFIX,
    runtimeErrorCount,
    clientStatus: client?.status,
    ...extractNetworkErrorMeta(err),
    ...context,
    trace: traceFromUnknown(err)
  });
}

/**
 * @param {import('ioredis').Redis} c
 */
function attachRedisEventLogging(c) {
  c.on('error', (err) => {
    logRedisRuntimeError('connection error event', err);
  });

  c.on('close', () => {
    logger.warn({
      message: '[redis] connection closed',
      uri: redactConnectionUrl(REDIS_URL),
      clientStatus: c.status
    });
  });

  c.on('reconnecting', (delay) => {
    logger.warn({
      message: '[redis] reconnecting',
      uri: redactConnectionUrl(REDIS_URL),
      delayMs: delay,
      clientStatus: c.status
    });
  });

  c.on('end', () => {
    logger.warn({
      message: '[redis] connection ended',
      uri: redactConnectionUrl(REDIS_URL),
      clientStatus: c.status
    });
    client = null;
    connectPromise = null;
  });
}

/**
 * @returns {Promise<Redis | null>}
 */
export async function getClient() {
  if (!REDIS_URL) {
    logger.warn({
      message: '[redis] REDIS_URL not set — skipping connection',
      hint: 'Check .env or docker-compose REDIS_URL'
    });
    return null;
  }

  if (client) return client;
  if (connectPromise) return connectPromise;

  connectAttempt += 1;
  const attempt = connectAttempt;

  connectPromise = (async () => {
    logger.info({
      message: '[redis] connecting',
      uri: redactConnectionUrl(REDIS_URL),
      attempt,
      maxRetriesPerRequest: 3
    });

    try {
      const c = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          const delayMs = Math.min(times * 200, 2000);

          if (times > 3) {
            logger.error({
              message: '[redis] retry limit reached — giving up initial connect',
              uri: redactConnectionUrl(REDIS_URL),
              attempt,
              retryTimes: times
            });
            return null;
          }

          logger.warn({
            message: '[redis] retry scheduled',
            uri: redactConnectionUrl(REDIS_URL),
            attempt,
            retryTimes: times,
            delayMs
          });

          return delayMs;
        },
        lazyConnect: true,
        connectTimeout: 10_000
      });

      attachRedisEventLogging(c);
      await c.connect();

      logger.info({
        message: '[redis] connected',
        uri: redactConnectionUrl(REDIS_URL),
        attempt,
        clientStatus: c.status
      });

      client = c;
      return client;
    } catch (err) {
      logRedisFailure('[redis] initial connect failed', err, {
        attempt,
        connectTimeoutMs: 10_000
      });
      connectPromise = null;
      client = null;
      return null;
    }
  })();

  return connectPromise;
}

export function key(name) {
  return REDIS_PREFIX + name;
}

/**
 * @param {string} op
 * @param {string} logicalKey
 * @param {unknown} err
 */
function logRedisCommandFailure(op, logicalKey, err) {
  logger.warn({
    message: `[redis] command failed | op=${op}`,
    uri: redactConnectionUrl(REDIS_URL),
    key: logicalKey,
    fullKey: key(logicalKey),
    clientStatus: client?.status,
    ...extractNetworkErrorMeta(err),
    trace: traceFromUnknown(err)
  });
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
  } catch (err) {
    logRedisCommandFailure('get', k, err);
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
  } catch (err) {
    logRedisCommandFailure('set', k, err);
    return false;
  }
}

/**
 * 키가 없을 때만 SET (NX). 성공 시 true.
 *
 * @param {string} k
 * @param {string} v
 * @param {number} [ttlSeconds]
 * @returns {Promise<boolean>}
 */
export async function setNx(k, v, ttlSeconds = REDIS_TTL_SECONDS) {
  const c = await getClient();
  if (!c) return false;
  try {
    const fullKey = key(k);
    const result =
      ttlSeconds > 0
        ? await c.set(fullKey, v, 'EX', ttlSeconds, 'NX')
        : await c.set(fullKey, v, 'NX');
    return result === 'OK';
  } catch (err) {
    logRedisCommandFailure('setNx', k, err);
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
  } catch (err) {
    logRedisCommandFailure('del', k, err);
    return false;
  }
}

/**
 * prefix로 시작하는 키 일괄 삭제 (SCAN — KEYS 사용 안 함)
 *
 * @param {string} prefix — REDIS_PREFIX 제외한 논리 키 접두사
 * @returns {Promise<boolean>}
 */
export async function delByPrefix(prefix) {
  const c = await getClient();
  if (!c) return false;

  try {
    const match = `${key(prefix)}*`;
    let cursor = '0';

    do {
      const [nextCursor, keys] = await c.scan(cursor, 'MATCH', match, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await c.del(...keys);
      }
    } while (cursor !== '0');

    return true;
  } catch (err) {
    logRedisCommandFailure('delByPrefix', prefix, err);
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
  } catch (err) {
    logger.warn({
      message: '[redis] JSON parse failed',
      key: k,
      errorMessage: err instanceof Error ? err.message : String(err)
    });
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
  } catch (err) {
    logRedisCommandFailure('setJson', k, err);
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
    const pong = await c.ping();
    return pong === 'PONG';
  } catch (err) {
    logRedisFailure('[redis] ping failed', err, {
      clientStatus: c.status
    });
    return false;
  }
}

export { REDIS_PREFIX, REDIS_TTL_SECONDS };

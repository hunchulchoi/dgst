import { getPrisma } from '$lib/database/prisma.js';
import logger from '$lib/util/logger.js';

const DEFAULT_TTL_SECONDS = 1800;

/**
 * Lazy-delete expired row for a single key.
 *
 * @param {string} k
 * @param {string} namespace
 * @returns {Promise<void>}
 */
async function deleteExpiredKey(k, namespace) {
  await getPrisma().$executeRawUnsafe(
    `DELETE FROM cache_kv
     WHERE namespace = $1 AND key = $2 AND expires_at < NOW()`,
    namespace,
    k
  );
}

/**
 * @param {string} k
 * @param {string} [namespace='default']
 * @returns {Promise<string | null>}
 */
export async function get(k, namespace = 'default') {
  try {
    await deleteExpiredKey(k, namespace);
    const hit = await getPrisma().$queryRaw`
      SELECT value #>> '{}' AS value FROM cache_kv
      WHERE namespace = ${namespace} AND key = ${k} AND expires_at >= NOW()
      LIMIT 1`;
    if (!Array.isArray(hit) || hit.length === 0) return null;
    const row = /** @type {{ value: string | null }} */ (hit[0]);
    if (row.value != null) return row.value;
    const fallback = await getPrisma().$queryRaw`
      SELECT value::text AS value FROM cache_kv
      WHERE namespace = ${namespace} AND key = ${k} AND expires_at >= NOW()
      LIMIT 1`;
    if (!Array.isArray(fallback) || fallback.length === 0) return null;
    return /** @type {{ value: string }} */ (fallback[0]).value;
  } catch (err) {
    logger.warn({ message: '[pgCache] get failed', key: k, namespace, error: String(err) });
    return null;
  }
}

/**
 * @param {string} k
 * @param {string} v
 * @param {number} [ttlSeconds]
 * @param {string} [namespace]
 * @returns {Promise<boolean>}
 */
export async function set(k, v, ttlSeconds = DEFAULT_TTL_SECONDS, namespace = 'default') {
  try {
    const expires = new Date(Date.now() + ttlSeconds * 1000);
    await getPrisma().$executeRawUnsafe(
      `INSERT INTO cache_kv (namespace, key, value, expires_at)
       VALUES ($1, $2, to_jsonb(CAST($3 AS text)), $4)
       ON CONFLICT (namespace, key)
       DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`,
      namespace,
      k,
      v,
      expires
    );
    return true;
  } catch (err) {
    logger.warn({ message: '[pgCache] set failed', key: k, namespace, error: String(err) });
    return false;
  }
}

/**
 * @param {string} k
 * @param {object} v
 * @param {number} [ttlSeconds]
 * @param {string} [namespace]
 * @returns {Promise<boolean>}
 */
export async function setJson(k, v, ttlSeconds = DEFAULT_TTL_SECONDS, namespace = 'default') {
  try {
    const expires = new Date(Date.now() + ttlSeconds * 1000);
    const json = JSON.stringify(v);
    await getPrisma().$executeRawUnsafe(
      `INSERT INTO cache_kv (namespace, key, value, expires_at)
       VALUES ($1, $2, CAST($3 AS jsonb), $4)
       ON CONFLICT (namespace, key)
       DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`,
      namespace,
      k,
      json,
      expires
    );
    return true;
  } catch (err) {
    logger.warn({ message: '[pgCache] setJson failed', key: k, namespace, error: String(err) });
    return false;
  }
}

/**
 * @param {string} k
 * @param {string} [namespace='default']
 * @returns {Promise<object | null>}
 */
export async function getJson(k, namespace = 'default') {
  try {
    await deleteExpiredKey(k, namespace);
    const hit = await getPrisma().$queryRaw`
      SELECT value::text AS value FROM cache_kv
      WHERE namespace = ${namespace} AND key = ${k} AND expires_at >= NOW()
      LIMIT 1`;
    if (!Array.isArray(hit) || hit.length === 0) return null;
    const raw = /** @type {{ value: string }} */ (hit[0]).value;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  } catch (err) {
    logger.warn({ message: '[pgCache] getJson failed', key: k, namespace, error: String(err) });
    return null;
  }
}

/**
 * @param {string} k
 * @param {string} [namespace]
 * @returns {Promise<boolean>}
 */
export async function del(k, namespace = 'default') {
  try {
    await getPrisma().$executeRawUnsafe(
      `DELETE FROM cache_kv WHERE namespace = $1 AND key = $2`,
      namespace,
      k
    );
    return true;
  } catch (err) {
    logger.warn({ message: '[pgCache] del failed', key: k, namespace, error: String(err) });
    return false;
  }
}

/**
 * @param {string} prefix
 * @param {string} [namespace]
 * @returns {Promise<boolean>}
 */
export async function delByPrefix(prefix, namespace = 'default') {
  try {
    await getPrisma().$executeRawUnsafe(
      `DELETE FROM cache_kv
       WHERE namespace = $1 AND key LIKE $2`,
      namespace,
      prefix + '%'
    );
    return true;
  } catch (err) {
    logger.warn({
      message: '[pgCache] delByPrefix failed',
      prefix,
      namespace,
      error: String(err)
    });
    return false;
  }
}

/**
 * @returns {Promise<boolean>}
 */
export async function isAvailable() {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return true;
  } catch (err) {
    logger.warn({ message: '[pgCache] isAvailable failed', error: String(err) });
    return false;
  }
}

/** @returns {Promise<void>} */
export async function purgeExpired() {
  try {
    await getPrisma().$executeRawUnsafe(`DELETE FROM cache_kv WHERE expires_at < NOW()`);
    await getPrisma().$executeRawUnsafe(`DELETE FROM rate_limit WHERE expires_at < NOW()`);
    await getPrisma().$executeRawUnsafe(`DELETE FROM dedup_lock WHERE expires_at < NOW()`);
  } catch (err) {
    logger.warn({ message: '[pgCache] purgeExpired failed', error: String(err) });
  }
}

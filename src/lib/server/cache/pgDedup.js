import getPrisma from '$lib/database/prisma.js';

/**
 * SET-NX style lock in UNLOGGED `dedup_lock` table.
 *
 * @param {string} key
 * @param {number} ttlSeconds
 * @returns {Promise<boolean>} true if lock acquired (first caller)
 */
export async function tryAcquire(key, ttlSeconds) {
  const rows = await getPrisma().$queryRaw`
    INSERT INTO dedup_lock (key, expires_at)
    VALUES (${key}, NOW() + (${ttlSeconds} || ' seconds')::interval)
    ON CONFLICT DO NOTHING
    RETURNING key`;
  return Array.isArray(rows) && rows.length > 0;
}

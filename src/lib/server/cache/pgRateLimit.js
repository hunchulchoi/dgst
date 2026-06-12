import getPrisma from '$lib/database/prisma.js';

/**
 * Sliding-window rate limit counter in UNLOGGED `rate_limit` table.
 *
 * @param {string} bucket
 * @param {number} windowSeconds
 * @param {number} limit
 * @returns {Promise<boolean>} true if request is allowed
 */
export async function incrementRateLimit(bucket, windowSeconds, limit) {
  const rows = /** @type {Array<{ count?: bigint | number | string }>} */ (await getPrisma().$queryRaw`
    INSERT INTO rate_limit (bucket, count, expires_at)
    VALUES (${bucket}, 1, NOW() + (${windowSeconds} || ' seconds')::interval)
    ON CONFLICT (bucket) DO UPDATE SET
      count = CASE WHEN rate_limit.expires_at < NOW() THEN 1 ELSE rate_limit.count + 1 END,
      expires_at = CASE WHEN rate_limit.expires_at < NOW()
        THEN NOW() + (${windowSeconds} || ' seconds')::interval
        ELSE rate_limit.expires_at END
    RETURNING count`);
  const count = Number(rows[0]?.count ?? 1);
  return count <= limit;
}

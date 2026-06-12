import { incrementRateLimit } from '$lib/server/cache/pgRateLimit.js';

/** @type {Map<string, { count: number, resetAt: number }>} */
const memoryBuckets = new Map();

/**
 * IP 기준 간단 rate limit (Postgres 우선, 없으면 메모리).
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {{ limit: number, windowSeconds: number, bucket: string }} options
 * @returns {Promise<{ allowed: true } | { allowed: false }>}
 */
export async function checkRateLimit(
  event,
  { limit, windowSeconds, bucket }
) {
  const ip =
    event.getClientAddress?.() ??
    event.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown';
  const rateKey = `ratelimit:${bucket}:${ip}`;

  try {
    const allowed = await incrementRateLimit(rateKey, windowSeconds, limit);
    return allowed ? { allowed: true } : { allowed: false };
  } catch {
    /* fall through to memory */
  }

  const now = Date.now();
  const entry = memoryBuckets.get(rateKey);
  if (!entry || entry.resetAt <= now) {
    memoryBuckets.set(rateKey, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true };
  }

  entry.count += 1;
  if (entry.count > limit) {
    return { allowed: false };
  }
  return { allowed: true };
}

/**
 * Auth 관련 Postgres rate-limit.
 * /auth/* POST 요청에 대해 IP당 분당 최대 요청 수 제한.
 */
import { incrementRateLimit } from '$lib/server/cache/pgRateLimit.js';

const AUTH_RATE_LIMIT_KEY_PREFIX = 'ratelimit:auth:';
const AUTH_RATE_LIMIT_WINDOW_SEC = 60;
const AUTH_RATE_LIMIT_MAX = 30;

/**
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @returns {Promise<boolean>} true면 통과, false면 제한 초과(429 반환 권장)
 */
export async function checkAuthRateLimit(event) {
  const raw =
    event.request?.headers?.get?.('x-forwarded-for') ||
    event.request?.headers?.get?.('x-real-ip') ||
    '';
  const ip =
    (raw ? String(raw).split(',')[0].trim() : '') || (event.getClientAddress?.() ?? 'unknown');
  const bucket = AUTH_RATE_LIMIT_KEY_PREFIX + ip;
  return incrementRateLimit(bucket, AUTH_RATE_LIMIT_WINDOW_SEC, AUTH_RATE_LIMIT_MAX);
}

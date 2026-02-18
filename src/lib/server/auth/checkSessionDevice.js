/**
 * 글쓰기/댓글 등 요청 시 세션의 deviceId·UA를 Redis에 저장된 값과 비교.
 * 불일치 시 error 로그만 남기고 추이 관찰용(요청은 그대로 진행).
 */
import { NODE_ENV } from '$env/static/private';
import * as redis from '$lib/server/redis/client.js';
import logger from '$lib/util/logger.js';

const DEVICE_COOKIE_NAME = 'dgst_device';
const SESSION_DEVICE_PREFIX = 'session_device:';
const SESSION_DEVICE_TTL = 30 * 24 * 60 * 60; // 30일

const SESSION_COOKIE_NAME =
  NODE_ENV === 'production' ? '__Secure-authjs.session-token' : 'authjs.session-token';

/**
 * @param {{ cookies: { get: (name: string) => string | undefined }; request: Request }} event
 * @param {{ action: string }} meta - 로그용 (예: { action: 'board.write' })
 */
export async function checkAndLogSessionDevice(event, meta = {}) {
  try {
    const sessionToken = event.cookies.get(SESSION_COOKIE_NAME);
    const deviceId = event.cookies.get(DEVICE_COOKIE_NAME) ?? '';
    const userAgent = event.request?.headers?.get?.('user-agent') ?? '';

    if (!sessionToken) return;

    const key = SESSION_DEVICE_PREFIX + sessionToken;
    const stored = await redis.getJson(key);

    if (stored && (stored.deviceId !== deviceId || stored.userAgent !== userAgent)) {
      logger.error({
        message: 'Session deviceId/UA mismatch (추이 관찰)',
        action: meta.action ?? 'unknown',
        storedDeviceId: stored.deviceId ?? '',
        currentDeviceId: deviceId,
        storedUserAgent: (stored.userAgent ?? '').slice(0, 200),
        currentUserAgent: userAgent.slice(0, 200)
      });
    }

    await redis.setJson(key, { deviceId, userAgent }, SESSION_DEVICE_TTL);
  } catch (e) {
    // Redis/로그 실패해도 요청은 방해하지 않음
    logger.warn({ message: 'checkSessionDevice failed', error: e?.message });
  }
}

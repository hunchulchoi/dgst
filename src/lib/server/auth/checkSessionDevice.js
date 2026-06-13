/**
 * 글쓰기/댓글 등 요청 시 세션의 deviceId·UA 계열을 pgCache에 저장된 값과 비교.
 * 불일치 시 error 로그만 남기고 추이 관찰용(요청은 그대로 진행).
 */
import { NODE_ENV } from '$env/static/private';
import * as pgCache from '$lib/server/cache/pgCache.js';
import logger from '$lib/util/logger.js';

const DEVICE_COOKIE_NAME = 'dgst_device';
const SESSION_DEVICE_PREFIX = 'session_device:';
const SESSION_DEVICE_TTL = 30 * 24 * 60 * 60; // 30일
const DEVICE_NS = 'device';

const SESSION_COOKIE_NAME =
  NODE_ENV === 'production' ? '__Secure-authjs.session-token' : 'authjs.session-token';

/**
 * UA 전체 문자열은 브라우저 버전 패치에도 자주 바뀌므로, 보안 관찰에는 안정적인 계열만 사용합니다.
 * @param {string} userAgent
 */
export function getUserAgentFingerprint(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  const platform = ua.includes('iphone')
    ? 'ios:iphone'
    : ua.includes('ipad')
      ? 'ios:ipad'
      : ua.includes('android')
        ? 'android'
        : ua.includes('windows')
          ? 'windows'
          : ua.includes('macintosh') || ua.includes('mac os x')
            ? 'macos'
            : ua.includes('linux')
              ? 'linux'
              : 'unknown';

  const browser = ua.includes('kakaotalk')
    ? 'kakaotalk'
    : ua.includes('crios')
      ? 'chrome-ios'
      : ua.includes('edg/')
        ? 'edge'
        : ua.includes('firefox/')
          ? 'firefox'
          : ua.includes('chrome/') || ua.includes('chromium/')
            ? ua.includes('; wv)') || ua.includes(' version/4.0 ') || ua.includes(' wv')
              ? 'android-webview'
              : 'chrome'
            : ua.includes('safari/')
              ? 'safari'
              : 'unknown';

  return `${platform}:${browser}`;
}

/**
 * @param {{ deviceId?: string; userAgent?: string }} stored
 * @param {{ deviceId?: string; userAgent?: string }} current
 * @returns {Array<'deviceId' | 'userAgent'> | null}
 */
export function getSessionDeviceMismatch(stored, current) {
  /** @type {Array<'deviceId' | 'userAgent'>} */
  const reasons = [];

  if ((stored.deviceId ?? '') !== (current.deviceId ?? '')) {
    reasons.push('deviceId');
  }

  if (
    getUserAgentFingerprint(stored.userAgent ?? '') !==
    getUserAgentFingerprint(current.userAgent ?? '')
  ) {
    reasons.push('userAgent');
  }

  return reasons.length ? reasons : null;
}

/**
 * @param {{ cookies: { get: (name: string) => string | undefined }; request: Request }} event
 * @param {{ action?: string }} [meta] - 로그용 (예: { action: 'board.write' })
 */
export async function checkAndLogSessionDevice(event, meta = {}) {
  try {
    const sessionToken = event.cookies.get(SESSION_COOKIE_NAME);
    const deviceId = event.cookies.get(DEVICE_COOKIE_NAME) ?? '';
    const userAgent = event.request?.headers?.get?.('user-agent') ?? '';

    if (!sessionToken) return;

    const key = SESSION_DEVICE_PREFIX + sessionToken;
    const stored = /** @type {{ deviceId?: string; userAgent?: string } | null} */ (
      await pgCache.getJson(key, DEVICE_NS)
    );

    const mismatchReasons = stored
      ? getSessionDeviceMismatch(stored, { deviceId, userAgent })
      : null;

    if (stored && mismatchReasons) {
      logger.error({
        message: 'Session deviceId/UA mismatch (추이 관찰)',
        action: meta.action ?? 'unknown',
        mismatchReasons,
        storedDeviceId: stored.deviceId ?? '',
        currentDeviceId: deviceId,
        storedUserAgentFingerprint: getUserAgentFingerprint(stored.userAgent ?? ''),
        currentUserAgentFingerprint: getUserAgentFingerprint(userAgent),
        storedUserAgent: (stored.userAgent ?? '').slice(0, 200),
        currentUserAgent: userAgent.slice(0, 200)
      });
    }

    await pgCache.setJson(key, { deviceId, userAgent }, SESSION_DEVICE_TTL, DEVICE_NS);
  } catch (e) {
    // pgCache/로그 실패해도 요청은 방해하지 않음
    logger.warn({ message: 'checkSessionDevice failed', error: e });
  }
}

import { env as privateEnv } from '$env/dynamic/private';
import logger from '$lib/util/logger.js';

/**
 * Cloudflare Turnstile 토큰 검증.
 * @param {string | null | undefined} token
 * @param {string} expectedAction
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
export async function verifyTurnstileToken(token, expectedAction) {
  const secret = privateEnv.CLOUDFLARE_TURNSTILE_SECRET_KEY;
  if (!secret) {
    logger.error({ message: 'CLOUDFLARE_TURNSTILE_SECRET_KEY not set' });
    return { ok: false, message: '봇 방지 설정이 완료되지 않았습니다.' };
  }

  if (!token || typeof token !== 'string') {
    return { ok: false, message: '봇 방지 확인이 필요합니다.' };
  }

  try {
    const body = new URLSearchParams({ secret, response: token });
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      return { ok: false, message: '봇 방지 확인에 실패했습니다.' };
    }

    const result = await response.json();
    if (!result.success) {
      return { ok: false, message: '봇 방지 확인에 실패했습니다.' };
    }

    if (result.action !== expectedAction) {
      return { ok: false, message: '봇 방지 요청 정보가 일치하지 않습니다.' };
    }

    return { ok: true };
  } catch (error) {
    logger.error({
      message: 'Turnstile verify request failed',
      error: error instanceof Error ? error.message : error
    });
    return { ok: false, message: '봇 방지 확인 중 오류가 발생했습니다.' };
  }
}

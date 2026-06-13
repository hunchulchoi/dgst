import { GOOGLE_RECAPTCHA_SECRET_KEY } from '$env/static/private';
import logger from '$lib/util/logger.js';

/**
 * Google reCAPTCHA v3 토큰 검증.
 * @param {string | null | undefined} token
 * @param {string} [expectedAction]
 * @param {number} [minScore]
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
export async function verifyRecaptchaToken(token, expectedAction = 'register', minScore = 0.5) {
  if (!GOOGLE_RECAPTCHA_SECRET_KEY) {
    logger.warn({ message: 'GOOGLE_RECAPTCHA_SECRET_KEY not set; skipping verification' });
    return { ok: true };
  }

  if (!token || typeof token !== 'string') {
    return { ok: false, message: 'reCAPTCHA 토큰이 없습니다.' };
  }

  try {
    const body = new URLSearchParams({
      secret: GOOGLE_RECAPTCHA_SECRET_KEY,
      response: token
    });

    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) {
      return { ok: false, message: 'reCAPTCHA 검증에 실패했습니다.' };
    }

    const data = await res.json();
    if (!data.success) {
      return { ok: false, message: 'reCAPTCHA 검증에 실패했습니다.' };
    }

    if (expectedAction && data.action && data.action !== expectedAction) {
      return { ok: false, message: 'reCAPTCHA action이 일치하지 않습니다.' };
    }

    if (typeof data.score === 'number' && data.score < minScore) {
      return { ok: false, message: 'reCAPTCHA 점수가 낮습니다.' };
    }

    return { ok: true };
  } catch (err) {
    logger.error({
      message: 'reCAPTCHA verify request failed',
      error: err instanceof Error ? err.message : err
    });
    return { ok: false, message: 'reCAPTCHA 검증 중 오류가 발생했습니다.' };
  }
}

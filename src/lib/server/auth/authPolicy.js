const DENIED_USER_STATES = new Set(['blocked', 'banned']);

/** @param {{ state?: unknown } | null | undefined} user */
export function isDeniedAuthUser(user) {
  return typeof user?.state === 'string' && DENIED_USER_STATES.has(user.state);
}

/**
 * @param {{
 *   provider?: string,
 *   user?: { state?: unknown } | null,
 *   profile?: Record<string, unknown> | null
 * }} input
 * @returns {{ allowed: true } | { allowed: false; reason: 'user-denied' | 'email-unverified' }}
 */
export function evaluateAuthSignIn({ provider, user, profile }) {
  if (isDeniedAuthUser(user)) {
    return { allowed: false, reason: 'user-denied' };
  }

  // 세션 재검증처럼 프로필 없는 사용자 흐름은 상태 검사 후 허용한다.
  if (!profile && user) return { allowed: true };

  // 카카오는 이메일 제공 동의가 필수가 아니며 provider id로 계정을 식별한다.
  if (provider === 'kakao') return { allowed: true };

  const emailVerified = profile?.email_verified ?? profile?.emailVerified;
  return emailVerified === true
    ? { allowed: true }
    : { allowed: false, reason: 'email-unverified' };
}

/**
 * 인증 완료 후 이동은 현재 사이트 내부로만 제한한다.
 * @param {string} url
 * @param {string} baseUrl
 */
export function resolveSafeAuthRedirect(url, baseUrl) {
  try {
    const base = new URL(baseUrl);

    if (url.startsWith('/') && !url.startsWith('//')) {
      return new URL(url, base).href;
    }

    const target = new URL(url);
    if (target.protocol === base.protocol && target.origin === base.origin) return target.href;

    return base.origin;
  } catch {
    try {
      return new URL(baseUrl).origin;
    } catch {
      return baseUrl;
    }
  }
}

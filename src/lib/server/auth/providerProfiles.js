import crypto from 'node:crypto';

/** @param {string} value */
const hash = (value) => crypto.createHash('sha512').update(value).digest('base64url');

/** @param {{ sub: string, email: string, name?: string | null }} profile */
export function mapGoogleAuthProfile(profile) {
  return {
    id: profile.sub,
    email: hash(profile.email),
    nickname: profile.name ?? '',
    introduction: '우리 자기',
    photo: null,
    state: 'registered',
    grade: 'user'
  };
}

/**
 * @param {{
 *   id: string | number,
 *   kakao_account?: {
 *     email?: string | null,
 *     name?: string | null,
 *     profile?: { nickname?: string | null } | null
 *   } | null
 * }} profile
 */
export function mapKakaoAuthProfile(profile) {
  const kakaoAccount = profile.kakao_account || {};
  const kakaoId = String(profile.id);

  return {
    id: kakaoId,
    email: kakaoAccount.email ? hash(kakaoAccount.email) : hash(`kakao:${kakaoId}`),
    nickname:
      kakaoAccount.profile?.nickname || kakaoAccount.name || `카카오${kakaoId.slice(-4)}`,
    introduction: '우리 자기',
    photo: null,
    state: 'registered',
    grade: 'user'
  };
}

import crypto from 'node:crypto';
import { stripForbiddenNicknameChars } from '../../util/nickname.js';

/** @param {string} value */
const hash = (value) => crypto.createHash('sha512').update(value).digest('base64url');

// 절대 변경 금지: 반환 id는 Auth.js accounts.provider_account_id로 저장된다.
// 임의 UUID를 반환하면 로그인할 때마다 새 계정 연결이 생겨 기존 회원을 찾지 못한다.
/** @param {{ sub: string, email: string, name?: string | null }} profile */
export function mapGoogleAuthProfile(profile) {
  return {
    id: profile.sub,
    email: hash(profile.email),
    // 첫 가입 닉네임은 소셜 이름을 쓰므로 봇 전용 이모지를 걸러낸다.
    nickname: stripForbiddenNicknameChars(profile.name),
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
      stripForbiddenNicknameChars(kakaoAccount.profile?.nickname) ||
      stripForbiddenNicknameChars(kakaoAccount.name) ||
      `카카오${kakaoId.slice(-4)}`,
    introduction: '우리 자기',
    photo: null,
    state: 'registered',
    grade: 'user'
  };
}

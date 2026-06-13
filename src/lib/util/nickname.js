/**
 * 닉네임에 사용 불가한 문자 (이모지 등)
 */
export const NICKNAME_FORBIDDEN = '🤖';

/**
 * @param {string} nickname
 * @returns {boolean} 사용 가능하면 true
 */
export function isNicknameAllowed(nickname) {
  if (typeof nickname !== 'string') return false;
  return !nickname.includes(NICKNAME_FORBIDDEN);
}

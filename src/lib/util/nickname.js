/**
 * 닉네임에 사용 불가한 문자 (봇 전용 이모지)
 */
export const NICKNAME_FORBIDDEN = '🤖';

export const NICKNAME_BOT_ONLY_MESSAGE = `${NICKNAME_FORBIDDEN}는 봇 전용 이모티콘입니다.`;
export const NICKNAME_LENGTH_MESSAGE = '닉네임은 2~15글자로 입력해주세요.';

/**
 * @param {string} nickname
 * @returns {boolean} 사용 가능하면 true
 */
export function isNicknameAllowed(nickname) {
  if (typeof nickname !== 'string') return false;
  return !nickname.includes(NICKNAME_FORBIDDEN);
}

/**
 * 소셜 로그인 이름처럼 검증 없이 들어오는 값에서 봇 전용 이모지를 지운다.
 * @param {string | null | undefined} value
 * @returns {string}
 */
export function stripForbiddenNicknameChars(value) {
  return String(value ?? '')
    .replaceAll(NICKNAME_FORBIDDEN, '')
    .trim();
}

/**
 * 닉네임 입력 오류 문구. 봇 전용 이모지를 길이보다 먼저 알려준다.
 * @param {string} nickname
 * @returns {string | null} 사용 가능하면 null
 */
export function getNicknameError(nickname) {
  if (!isNicknameAllowed(nickname)) return NICKNAME_BOT_ONLY_MESSAGE;
  if (!/^.{2,15}$/.test(nickname)) return NICKNAME_LENGTH_MESSAGE;
  return null;
}

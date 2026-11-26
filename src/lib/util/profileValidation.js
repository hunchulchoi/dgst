import { getNicknameError, NICKNAME_LENGTH_MESSAGE } from './nickname.js';

/**
 * @param {{
 *   nickname: string;
 *   nicknameInvalid: boolean;
 *   nicknameTaken?: boolean;
 * }} profile
 * @returns {string | null}
 */
export function getProfileValidationMessage(profile) {
  if (!profile.nickname) return '닉네임을 입력해주세요.';
  if (profile.nicknameTaken) return '사용중인 아이디 입니다.';
  if (profile.nicknameInvalid) return getNicknameError(profile.nickname) ?? NICKNAME_LENGTH_MESSAGE;
  return null;
}

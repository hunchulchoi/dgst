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
  if (profile.nicknameInvalid) return '닉네임은 2~15글자로 입력해주세요.';
  return null;
}

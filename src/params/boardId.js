/**
 * board id 유효성 검사
 * @param param
 * @returns {boolean}
 */
export function match(param) {
  return ['free', 'bug'].includes(param);
}

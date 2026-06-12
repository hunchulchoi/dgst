/**
 * board id 유효성 검사
 * @param {string} param
 * @returns {boolean}
 */
export function match(param) {
  return ['free', 'bug'].includes(param);
}

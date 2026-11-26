import { defineParams } from '@sveltejs/kit/params';

/**
 * board id 유효성 검사
 * @param {string} param
 * @returns {boolean}
 */
function matchBoardId(param) {
  return ['free', 'bug'].includes(param);
}

function matchInteger(param) {
  return /^\d+$/.test(param);
}

export const params = defineParams({
  boardId: (param) => (matchBoardId(param) ? param : undefined),
  integer: (param) => (matchInteger(param) ? param : undefined)
});

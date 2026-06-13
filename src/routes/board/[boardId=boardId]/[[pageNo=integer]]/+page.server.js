import { loadBoardList } from '$lib/server/boardListLoad.js';

export const load = async (event) => loadBoardList(event, event.params.boardId);

import connectDB from '$lib/database/mongoosePriomise.js';
import { loadBoardList } from '$lib/server/boardListLoad.js';

connectDB();

export const load = async (event) => loadBoardList(event, event.params.boardId);

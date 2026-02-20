import connectDB from '$lib/database/mongoosePriomise.js';
import { getTodayMinesweeperStats } from '$lib/server/gameMinesweeperStats.js';

connectDB();

export async function load({ locals }) {
    const session = await locals.auth();
    let todayStats = { games: 0, users: 0 };
    try {
        todayStats = await getTodayMinesweeperStats();
    } catch (e) { }

    return { session, todayStats };
}

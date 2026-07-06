import { getTodayMinesweeperStats } from '$lib/server/gameMinesweeperStats.js';
import { getGameSession } from '$lib/server/localGameSmokeSession.js';

export async function load(event) {
  const session = await getGameSession(event);
  let todayStats = { games: 0, users: 0 };
  try {
    todayStats = await getTodayMinesweeperStats();
  } catch {}

  return { session, todayStats };
}

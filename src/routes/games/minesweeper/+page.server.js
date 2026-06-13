import { getTodayMinesweeperStats } from '$lib/server/gameMinesweeperStats.js';

export async function load({ locals }) {
  const session = await locals.auth();
  let todayStats = { games: 0, users: 0 };
  try {
    todayStats = await getTodayMinesweeperStats();
  } catch {}

  return { session, todayStats };
}

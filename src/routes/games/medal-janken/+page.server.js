import { getGameSession, isLocalGameSmokeSession } from '$lib/server/localGameSmokeSession.js';
import {
  ensureMedalJankenBalance,
  getMedalJankenRank,
  getTodayMedalJankenStats,
  INITIAL_MEDALS
} from './medalJankenBalance.js';

/** @param {import('./$types').PageServerLoadEvent} event */
export async function load(event) {
  const session = await getGameSession(event);
  if (isLocalGameSmokeSession(session)) {
    return {
      session,
      balance: INITIAL_MEDALS,
      rank: [],
      todayStats: { hands: 0, users: 0 }
    };
  }

  const email = session?.user?.email;
  const nickname = session?.user?.nickname || session?.user?.name || 'anonymous';
  const [balance, rank, todayStats] = await Promise.all([
    email ? ensureMedalJankenBalance(email, nickname) : INITIAL_MEDALS,
    getMedalJankenRank(10).catch(() => []),
    getTodayMedalJankenStats().catch(() => ({ hands: 0, users: 0 }))
  ]);
  return { session, balance, rank, todayStats };
}

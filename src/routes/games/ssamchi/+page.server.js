import { getGameSession, isLocalGameSmokeSession } from '$lib/server/localGameSmokeSession.js';
import {
  ensureSsamchiBalance,
  getSsamchiRank,
  getTodaySsamchiStats,
  resolveSsamchiOops
} from './ssamchiBalance.js';

const SMOKE_BALANCE = 1000;

/** @param {import('./$types').PageServerLoadEvent} event */
export async function load(event) {
  const session = await getGameSession(event);
  const todayStats = await getTodaySsamchiStats().catch(() => ({ hands: 0, users: 0 }));
  if (isLocalGameSmokeSession(session)) {
    return { session, balance: SMOKE_BALANCE, rank: [], todayStats, oopsInfo: null };
  }
  const email = session?.user?.email;
  if (!email) return { session, balance: 0, rank: [], todayStats, oopsInfo: null };
  const nickname = session?.user?.nickname || session?.user?.name || 'anonymous';
  const initial = await ensureSsamchiBalance(email, nickname);
  const state = await resolveSsamchiOops(email, nickname, initial.balance);
  const rank = await getSsamchiRank(10).catch(() => []);
  return { session, rank, todayStats, ...state };
}

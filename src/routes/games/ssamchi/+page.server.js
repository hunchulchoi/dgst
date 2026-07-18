import { getGameSession, isLocalGameSmokeSession } from '$lib/server/localGameSmokeSession.js';
import {
  ensureSsamchiBalance,
  getSsamchiHost,
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
    return { session, balance: SMOKE_BALANCE, rank: [], todayStats, oopsInfo: null, host: 'npc' };
  }
  const email = session?.user?.email;
  if (!email) return { session, balance: 0, rank: [], todayStats, oopsInfo: null, host: 'npc' };
  const nickname = session?.user?.nickname || session?.user?.name || 'anonymous';
  const initial = await ensureSsamchiBalance(email, nickname);
  const state = await resolveSsamchiOops(email, nickname, initial.balance);
  const [rank, host] = await Promise.all([
    getSsamchiRank(10).catch(() => []),
    getSsamchiHost(email)
  ]);
  return { session, rank, todayStats, host, ...state };
}

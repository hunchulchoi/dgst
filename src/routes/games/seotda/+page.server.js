import { getGameSession, isLocalGameSmokeSession } from '$lib/server/localGameSmokeSession.js';
import {
  ensureSeotdaBalance,
  getSeotdaRank,
  getTodaySeotdaStats,
  resolveSeotdaOops
} from './seotdaBalance.js';
import { getRound, toPublicState } from './seotdaState.js';
import { evaluateHand } from './seotdaEngine.js';

const SMOKE_BALANCE = 1000;

/** @param {import('./$types').PageServerLoadEvent} event */
export async function load(event) {
  try {
    const session = await getGameSession(event);
    const todayStats = await getTodaySeotdaStats();
    if (isLocalGameSmokeSession(session)) {
      return {
        session,
        balance: SMOKE_BALANCE,
        oopsInfo: null,
        rank: [],
        round: null,
        todayStats
      };
    }
    const email = session?.user?.email;
    if (!email) {
      return { session, balance: 0, oopsInfo: null, rank: [], round: null, todayStats };
    }
    const nickname = session?.user?.nickname || session?.user?.name || 'anonymous';
    let { balance } = await ensureSeotdaBalance(email, nickname);
    let oopsInfo = null;
    if (balance === 0) {
      const resolved = await resolveSeotdaOops(email, nickname);
      balance = resolved.balance;
      oopsInfo = resolved.oopsInfo;
    }
    const rank = await getSeotdaRank(10);
    const round = getRound(email);
    return {
      session,
      balance,
      oopsInfo,
      rank,
      round: round ? toPublicState(round, 'user', evaluateHand) : null,
      todayStats
    };
  } catch (err) {
    console.error('[seotda load]', err);
    return {
      session: null,
      balance: 0,
      oopsInfo: null,
      rank: [],
      round: null,
      todayStats: { hands: 0, users: 0 }
    };
  }
}

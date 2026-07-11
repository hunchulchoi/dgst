import { getGameSession, isLocalGameSmokeSession } from '$lib/server/localGameSmokeSession.js';
import { ensureSeotdaBalance, getSeotdaRank, getTodaySeotdaStats, maybeTopupAfterOops } from './seotdaBalance.js';
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
        rank: [],
        round: null,
        todayStats
      };
    }
    const email = session?.user?.email;
    if (!email) {
      return { session, balance: 0, rank: [], round: null, todayStats };
    }
    const nickname = session?.user?.nickname || session?.user?.name || 'anonymous';
    let { balance } = await ensureSeotdaBalance(email, nickname);
    if (balance === 0) {
      const topped = await maybeTopupAfterOops(email, nickname);
      if (topped > 0) balance = topped;
    }
    const rank = await getSeotdaRank(10);
    const round = getRound(email);
    return {
      session,
      balance,
      rank,
      round: round ? toPublicState(round, 'user', evaluateHand) : null,
      todayStats
    };
  } catch (err) {
    console.error('[seotda load]', err);
    return { session: null, balance: 0, rank: [], round: null, todayStats: { hands: 0, users: 0 } };
  }
}

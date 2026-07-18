import { error, json } from '@sveltejs/kit';
import { checkRateLimit } from '$lib/server/apiRateLimit.js';
import { getGameSession, isLocalGameSmokeSession } from '$lib/server/localGameSmokeSession.js';
import {
  ensureSsamchiBalance,
  getSsamchiRank,
  getTodaySsamchiStats,
  resolveSsamchiOops,
  writeSsamchiScore
} from './ssamchiBalance.js';
import { integerInRange, MAX_COINS, MIN_BET, playSsamchi } from './ssamchiEngine.js';

const SMOKE_BALANCE = 1000;
/** @type {Set<string>} */
const settlingUsers = new Set();

/** @param {import('@sveltejs/kit').RequestEvent} event */
async function requireUser(event) {
  const session = await getGameSession(event);
  const email = session?.user?.email;
  if (!email) throw error(401, { message: '로그인이 필요합니다.' });
  return {
    email,
    nickname: session?.user?.nickname || session?.user?.name || 'anonymous',
    smoke: isLocalGameSmokeSession(session)
  };
}

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function GET(event) {
  const user = await requireUser(event);
  if (user.smoke)
    return json({ balance: SMOKE_BALANCE, rank: [], todayStats: { hands: 0, users: 0 } });
  const initial = await ensureSsamchiBalance(user.email, user.nickname);
  const state = await resolveSsamchiOops(user.email, user.nickname, initial.balance);
  const [rank, todayStats] = await Promise.all([getSsamchiRank(10), getTodaySsamchiStats()]);
  return json({ ...state, rank, todayStats });
}

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function POST(event) {
  const rate = await checkRateLimit(event, { limit: 8, windowSeconds: 10, bucket: 'ssamchi-post' });
  if (!rate.allowed) throw error(429, { message: '너무 빠릅니다. 잠시 후 다시 해 주세요.' });

  const user = await requireUser(event);
  if (settlingUsers.has(user.email)) throw error(409, { message: '이전 판을 정산 중입니다.' });
  settlingUsers.add(user.email);
  try {
    const body = await event.request.json().catch(() => ({}));
    const hiddenCoins = Number(body?.hiddenCoins);
    const guess = Number(body?.guess);
    const bet = Number(body?.bet);
    if (!integerInRange(hiddenCoins, 0, MAX_COINS))
      throw error(400, { message: '숨길 동전을 골라 주세요.' });
    if (!Number.isSafeInteger(bet) || bet < MIN_BET)
      throw error(400, { message: '판돈은 10점 이상입니다.' });

    const current = user.smoke
      ? { balance: SMOKE_BALANCE, oopsInfo: null }
      : await ensureSsamchiBalance(user.email, user.nickname).then((state) =>
          resolveSsamchiOops(user.email, user.nickname, state.balance)
        );
    if (current.oopsInfo) throw error(400, { message: '오링! 5분 후 500점이 충전됩니다.' });
    if (bet > current.balance) throw error(400, { message: '보유 점수가 부족합니다.' });

    let result;
    try {
      result = playSsamchi({ hiddenCoins, guess, bet });
    } catch (cause) {
      throw error(400, {
        message: cause instanceof Error ? cause.message : '잘못된 게임 요청입니다.'
      });
    }
    const balance = current.balance + result.delta;
    if (!user.smoke) {
      await writeSsamchiScore(user.email, user.nickname, balance, {
        bet,
        payout: result.payout,
        delta: result.delta,
        reels: [
          result.hit ? 'hit' : 'miss',
          `hand:${hiddenCoins}`,
          `npc:${result.npcCoins.join(',')}`,
          `guess:${guess}`,
          `total:${result.total}`
        ]
      });
    }
    return json({ success: true, balance, result });
  } finally {
    settlingUsers.delete(user.email);
  }
}

import { error, json } from '@sveltejs/kit';
import { checkRateLimit } from '$lib/server/apiRateLimit.js';
import { getGameSession, isLocalGameSmokeSession } from '$lib/server/localGameSmokeSession.js';
import {
  ensureSsamchiBalance,
  getSsamchiHost,
  getSsamchiRank,
  getTodaySsamchiStats,
  resolveSsamchiOops,
  writeSsamchiScore
} from './ssamchiBalance.js';
import { chooseNpcBet, MIN_BET, playOddEven, playSsamchi, SSAMCHI_NAMES } from './ssamchiEngine.js';

const SMOKE_BALANCE = 1000;
/** @type {Set<string>} */
const settlingUsers = new Set();
/** @type {Map<string, 'user'|'npc'>} */
const smokeHosts = new Map();

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
    return json({
      balance: SMOKE_BALANCE,
      rank: [],
      todayStats: { hands: 0, users: 0 },
      host: smokeHosts.get(user.email) ?? 'npc'
    });
  const initial = await ensureSsamchiBalance(user.email, user.nickname);
  const state = await resolveSsamchiOops(user.email, user.nickname, initial.balance);
  const [rank, todayStats, host] = await Promise.all([
    getSsamchiRank(10),
    getTodaySsamchiStats(),
    getSsamchiHost(user.email)
  ]);
  return json({ ...state, rank, todayStats, host });
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
    const mode = String(body?.mode ?? 'odd-even');

    const current = user.smoke
      ? { balance: SMOKE_BALANCE, oopsInfo: null }
      : await ensureSsamchiBalance(user.email, user.nickname).then((state) =>
          resolveSsamchiOops(user.email, user.nickname, state.balance)
        );
    if (current.oopsInfo) throw error(400, { message: '오링! 5분 후 500점이 충전됩니다.' });
    const host = user.smoke
      ? (smokeHosts.get(user.email) ?? 'npc')
      : await getSsamchiHost(user.email);
    const userIsHost = host === 'user';
    const bet = userIsHost ? chooseNpcBet(current.balance) : Number(body?.bet);
    if (!Number.isSafeInteger(bet) || bet < MIN_BET)
      throw error(400, { message: '판돈은 10점 이상입니다.' });
    if (bet > current.balance) throw error(400, { message: '보유 점수가 부족합니다.' });

    let result;
    let callLog = '-';
    let answerLog = '-';
    try {
      if (mode === 'odd-even') {
        result = playOddEven({
          choice: body?.choice,
          marbles: Number(body?.marbles),
          userIsHost,
          bet
        });
        callLog = `call:${result.choice}`;
        answerLog = `answer:${result.answer}`;
      } else if (mode === 'ssamchi') {
        const take = /** @type {0|1|2} */ (Number(body?.take));
        const give = /** @type {0|1|2} */ (Number(body?.give));
        result = playSsamchi({
          take,
          give,
          marbles: Number(body?.marbles),
          userIsHost,
          bet
        });
        callLog = `call:${SSAMCHI_NAMES[result.take ?? 1]}-${SSAMCHI_NAMES[result.give ?? 0]}`;
        answerLog = `answer:${SSAMCHI_NAMES[result.answer]}`;
      } else {
        throw new Error('홀짝 또는 쌈치기를 골라 주세요.');
      }
    } catch (cause) {
      throw error(400, {
        message: cause instanceof Error ? cause.message : '잘못된 게임 요청입니다.'
      });
    }
    const balance = current.balance + result.delta;
    const nextHost = result.outcome === 'draw' ? host : result.outcome === 'win' ? 'user' : 'npc';
    if (user.smoke) smokeHosts.set(user.email, nextHost);
    if (!user.smoke) {
      await writeSsamchiScore(user.email, user.nickname, balance, {
        bet,
        payout: result.payout,
        delta: result.delta,
        reels: [
          result.outcome,
          `mode:${result.mode}`,
          `host:${host}`,
          `next-host:${nextHost}`,
          `marbles:${result.marbles}`,
          callLog,
          answerLog
        ]
      });
    }
    return json({ success: true, balance, result, host: nextHost });
  } finally {
    settlingUsers.delete(user.email);
  }
}

import { error, json } from '@sveltejs/kit';
import { getGameSession, isLocalGameSmokeSession } from '$lib/server/localGameSmokeSession.js';
import { evaluateHand } from './seotdaEngine.js';
import {
  ensureSeotdaBalance,
  getSeotdaRank,
  maybeTopupAfterOops,
  writeSeotdaScore
} from './seotdaBalance.js';
import { clearRound, getRound, setRound, toPublicState } from './seotdaState.js';
import { applyPlayerAction, createNewRound, runNpcTurns, userChipResult } from './seotdaRound.js';

const SMOKE_BALANCE = 1000;

/** @type {Map<string, number>} */
const chipsBeforeMap = new Map();

/**
 * @param {import('./seotdaState.js').SeotdaRound} round
 */
function publicOf(round) {
  return toPublicState(round, 'user', evaluateHand);
}

/**
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
async function requireUser(event) {
  const session = await getGameSession(event);
  if (isLocalGameSmokeSession(session)) {
    return { email: session.user.email, nickname: session.user.nickname || '로컬스모크', smoke: true };
  }
  const email = session?.user?.email;
  if (!email) throw error(401, { message: '로그인이 필요합니다.' });
  const nickname = session?.user?.nickname || session?.user?.name || 'anonymous';
  return { email, nickname, smoke: false };
}

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function GET(event) {
  try {
    const user = await requireUser(event);
    if (user.smoke) {
      const round = getRound(user.email);
      return json({
        balance: SMOKE_BALANCE,
        rank: [],
        round: round ? publicOf(round) : null,
        oopsInfo: null
      });
    }

    let { balance } = await ensureSeotdaBalance(user.email, user.nickname);
    if (balance === 0) {
      const topped = await maybeTopupAfterOops(user.email, user.nickname);
      if (topped > 0) balance = topped;
    }
    const rank = await getSeotdaRank(10);
    const round = getRound(user.email);
    return json({
      balance,
      rank,
      round: round ? publicOf(round) : null,
      oopsInfo: balance === 0 ? { waiting: true } : null
    });
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) throw err;
    console.error('[seotda GET]', err);
    throw error(500, { message: '섯다 상태 조회 실패' });
  }
}

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function POST(event) {
  try {
    const user = await requireUser(event);
    const body = await event.request.json().catch(() => ({}));
    const action = String(body?.action ?? '');

    if (user.smoke) {
      return handleSmoke(user.email, action, body);
    }

    if (action === 'start') {
      let { balance } = await ensureSeotdaBalance(user.email, user.nickname);
      if (balance === 0) {
        const topped = await maybeTopupAfterOops(user.email, user.nickname);
        if (topped > 0) balance = topped;
      }
      if (balance < 10) {
        throw error(400, { message: '보유 점수가 부족합니다. 오링 후 잠시 기다려 주세요.' });
      }
      if (getRound(user.email)?.phase === 'betting') {
        throw error(400, { message: '이미 진행 중인 판이 있습니다.' });
      }
      const round = createNewRound(balance);
      chipsBeforeMap.set(user.email, balance);
      setRound(user.email, round);
      return json({ success: true, balance: round.seats[0].chips, round: publicOf(round) });
    }

    if (action === 'act') {
      const round = getRound(user.email);
      if (!round || round.phase !== 'betting') {
        throw error(400, { message: '진행 중인 베팅이 없습니다.' });
      }
      const move = String(body?.move ?? '');
      if (!['die', 'call', 'raise'].includes(move)) {
        throw error(400, { message: 'die | call | raise 만 가능' });
      }
      applyPlayerAction(round, 'user', /** @type {'die'|'call'|'raise'} */ (move));
      runNpcTurns(round);
      setRound(user.email, round);

      if (round.phase === 'showdown') {
        const before = chipsBeforeMap.get(user.email) ?? round.seats[0].chips;
        const result = userChipResult(before, round);
        await writeSeotdaScore(user.email, user.nickname, result.after, {
          bet: result.bet,
          payout: result.payout,
          delta: result.delta,
          reels: [
            round.winnerId === 'user' ? 'win' : 'lose',
            String(result.delta),
            round.seats.find((s) => s.id === 'user')?.lastAction ?? '-'
          ]
        });
        chipsBeforeMap.delete(user.email);
        return json({ success: true, balance: result.after, round: publicOf(round) });
      }

      return json({
        success: true,
        balance: round.seats.find((s) => s.id === 'user')?.chips ?? 0,
        round: publicOf(round)
      });
    }

    if (action === 'ack') {
      const round = getRound(user.email);
      if (round && round.phase === 'showdown') {
        clearRound(user.email);
      }
      const balance = (await ensureSeotdaBalance(user.email, user.nickname)).balance;
      return json({ success: true, balance, round: null });
    }

    throw error(400, { message: 'action: start | act | ack' });
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) throw err;
    console.error('[seotda POST]', err);
    throw error(500, { message: err instanceof Error ? err.message : '섯다 요청 실패' });
  }
}

/**
 * @param {string} email
 * @param {string} action
 * @param {Record<string, unknown>} body
 */
function handleSmoke(email, action, body) {
  if (action === 'start') {
    const round = createNewRound(SMOKE_BALANCE);
    chipsBeforeMap.set(email, SMOKE_BALANCE);
    setRound(email, round);
    return json({ success: true, balance: round.seats[0].chips, round: publicOf(round) });
  }
  if (action === 'act') {
    const round = getRound(email);
    if (!round || round.phase !== 'betting') {
      throw error(400, { message: '진행 중인 베팅이 없습니다.' });
    }
    const move = String(body?.move ?? '');
    applyPlayerAction(round, 'user', /** @type {'die'|'call'|'raise'} */ (move));
    runNpcTurns(round);
    setRound(email, round);
    const userChips = round.seats.find((s) => s.id === 'user')?.chips ?? 0;
    return json({ success: true, balance: userChips, round: publicOf(round) });
  }
  if (action === 'ack') {
    clearRound(email);
    return json({ success: true, balance: SMOKE_BALANCE, round: null });
  }
  throw error(400, { message: 'action: start | act | ack' });
}

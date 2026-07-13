import { error, json } from '@sveltejs/kit';
import { checkRateLimit } from '$lib/server/apiRateLimit.js';
import { getGameSession, isLocalGameSmokeSession } from '$lib/server/localGameSmokeSession.js';
import { evaluateHand } from './seotdaEngine.js';
import {
  ensureSeotdaBalance,
  didSeotdaTakeLead,
  getSeotdaCurrentLeader,
  getSeotdaRank,
  getTodaySeotdaStats,
  maybeTopupAfterOops,
  writeSeotdaScore
} from './seotdaBalance.js';
import {
  clearRound,
  getRound,
  setRound,
  toPublicState,
  getNpcStacks,
  saveNpcStacks,
  resetNpcStacks
} from './seotdaState.js';
import {
  applyPlayerAction,
  createNewRound,
  runNpcTurns,
  seotdaAuditLogEntries,
  userChipResult
} from './seotdaRound.js';

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
    return {
      email: session.user.email,
      nickname: session.user.nickname || '로컬스모크',
      smoke: true
    };
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
        oopsInfo: null,
        todayStats: { hands: 0, users: 0 }
      });
    }

    let { balance } = await ensureSeotdaBalance(user.email, user.nickname);
    if (balance === 0) {
      const topped = await maybeTopupAfterOops(user.email, user.nickname);
      if (topped > 0) balance = topped;
    }
    const [rank, todayStats] = await Promise.all([getSeotdaRank(10), getTodaySeotdaStats()]);
    const round = getRound(user.email);
    return json({
      balance,
      rank,
      round: round ? publicOf(round) : null,
      oopsInfo: balance === 0 ? { waiting: true } : null,
      todayStats
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
    const rateLimit = await checkRateLimit(event, {
      limit: 12,
      windowSeconds: 10,
      bucket: 'seotda-post'
    });
    if (!rateLimit.allowed) {
      throw error(429, { message: '요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.' });
    }
    const user = await requireUser(event);
    const body = await event.request.json().catch(() => ({}));
    const action = String(body?.action ?? '');

    if (user.smoke) {
      return handleSmoke(user.email, action, body);
    }

    if (action === 'start') {
      if (getRound(user.email)?.phase === 'betting') {
        throw error(400, { message: '이미 진행 중인 판이 있습니다.' });
      }
      // 새 테이블: NPC 칩 초기화
      const prev = getRound(user.email);
      if (prev) saveNpcStacks(user.email, prev);
      clearRound(user.email);
      return json(await beginRound(user.email, user.nickname));
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
      const raisePay = body?.amount != null ? Number(body.amount) : undefined;
      applyPlayerAction(
        round,
        'user',
        /** @type {'die'|'call'|'raise'} */ (move),
        Number.isFinite(raisePay) ? raisePay : undefined
      );
      runNpcTurns(round);
      setRound(user.email, round);

      if (round.phase === 'showdown') {
        const before = chipsBeforeMap.get(user.email) ?? round.seats[0].chips;
        const result = userChipResult(before, round);
        const leaderBefore = await getSeotdaCurrentLeader();
        // 다른 사용자가 보유하던 1위를 이번 판으로 추월한 경우만 축하한다.
        const tookLead = didSeotdaTakeLead(leaderBefore, user.email, result.after);
        const outcome =
          (round.winnerIds?.length ?? 0) > 1 ? 'draw' : round.winnerId === 'user' ? 'win' : 'lose';
        await writeSeotdaScore(user.email, user.nickname, result.after, {
          bet: result.bet,
          payout: result.payout,
          delta: result.delta,
          reels: [
            outcome,
            String(result.delta),
            round.seats.find((s) => s.id === 'user')?.lastAction ?? '-',
            tookLead ? 'lead' : '-',
            ...seotdaAuditLogEntries(round)
          ]
        });
        chipsBeforeMap.delete(user.email);
        saveNpcStacks(user.email, round);
        return json({ success: true, balance: result.after, round: publicOf(round) });
      }

      return json({
        success: true,
        balance: round.seats.find((s) => s.id === 'user')?.chips ?? 0,
        round: publicOf(round)
      });
    }

    if (action === 'ack') {
      // 쇼다운 확인 후 NPC 칩 유지한 채 다음 판
      const round = getRound(user.email);
      if (round && round.phase === 'showdown') {
        saveNpcStacks(user.email, round);
        clearRound(user.email);
      }
      return json(await beginRound(user.email, user.nickname));
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
 * @param {string} nickname
 */
async function beginRound(email, nickname) {
  let { balance } = await ensureSeotdaBalance(email, nickname);
  if (balance === 0) {
    const topped = await maybeTopupAfterOops(email, nickname);
    if (topped > 0) balance = topped;
  }
  if (balance < 10) {
    throw error(400, { message: '보유 점수가 부족합니다. 오링 후 잠시 기다려 주세요.' });
  }
  const npcChips = getNpcStacks(email);
  const round = createNewRound(balance, Math.random, npcChips);
  chipsBeforeMap.set(email, balance);
  setRound(email, round);
  return { success: true, balance: round.seats[0].chips, round: publicOf(round) };
}

/**
 * @param {string} email
 * @param {string} action
 * @param {Record<string, unknown>} body
 */
function handleSmoke(email, action, body) {
  if (action === 'start') {
    clearRound(email);
    resetNpcStacks(email);
    const round = createNewRound(SMOKE_BALANCE, Math.random, {});
    chipsBeforeMap.set(email, SMOKE_BALANCE);
    setRound(email, round);
    return json({ success: true, balance: round.seats[0].chips, round: publicOf(round) });
  }
  if (action === 'ack') {
    const prev = getRound(email);
    if (prev) saveNpcStacks(email, prev);
    clearRound(email);
    const round = createNewRound(SMOKE_BALANCE, Math.random, getNpcStacks(email));
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
    const raisePay = body?.amount != null ? Number(body.amount) : undefined;
    applyPlayerAction(
      round,
      'user',
      /** @type {'die'|'call'|'raise'} */ (move),
      Number.isFinite(raisePay) ? raisePay : undefined
    );
    runNpcTurns(round);
    setRound(email, round);
    const userChips = round.seats.find((s) => s.id === 'user')?.chips ?? 0;
    return json({ success: true, balance: userChips, round: publicOf(round) });
  }
  throw error(400, { message: 'action: start | act | ack' });
}

import { error, json } from '@sveltejs/kit';
import { checkRateLimit } from '$lib/server/apiRateLimit.js';
import { getGameSession, isLocalGameSmokeSession } from '$lib/server/localGameSmokeSession.js';
import { evaluateHand } from './seotdaEngine.js';
import {
  ensureSeotdaBalance,
  didSeotdaTakeLead,
  getSeotdaCurrentLeader,
  getSeotdaRank,
  getSeotdaSparkHistory,
  getTodaySeotdaStats,
  isSeotdaOopsBalance,
  resolveSeotdaOops,
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
  contributionCapacity,
  createNewRound,
  runNpcTurns,
  runNpcTurnsWithSpark,
  seotdaAuditLogEntries,
  sparkTauntCooldownAfterRound,
  userChipResult
} from './seotdaRound.js';
import { decideSparkIntervention, decideSparkNpcAction } from './seotdaSparkAppServer.js';

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
    let oopsInfo = null;
    if (isSeotdaOopsBalance(balance)) {
      const resolved = await resolveSeotdaOops(user.email, user.nickname, balance);
      balance = resolved.balance;
      oopsInfo = resolved.oopsInfo;
    }
    const [rank, todayStats] = await Promise.all([getSeotdaRank(10), getTodaySeotdaStats()]);
    const round = getRound(user.email);
    return json({
      balance,
      rank,
      round: round ? publicOf(round) : null,
      oopsInfo,
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
      const openingActorId = prev?.winnerId ?? 'user';
      const sparkTauntCooldown = sparkTauntCooldownAfterRound(prev);
      if (prev) saveNpcStacks(user.email, prev);
      clearRound(user.email);
      return json(await beginRound(user.email, user.nickname, openingActorId, sparkTauntCooldown));
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
      const userSeat = round.seats.find((seat) => seat.id === 'user');
      if (
        move === 'raise' &&
        userSeat &&
        Number.isFinite(raisePay) &&
        Number(raisePay) >= contributionCapacity(round, userSeat)
      ) {
        round.userMaxRaiseUsed = true;
      }
      applyPlayerAction(
        round,
        'user',
        /** @type {'die'|'call'|'raise'} */ (move),
        Number.isFinite(raisePay) ? raisePay : undefined
      );
      const npcActions = await runNpcTurnsWithSpark(round, decideSparkNpcAction);
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
            round.userMaxRaiseUsed ? 'user:max-raise' : 'user:no-max-raise',
            round.sparkIntervention ? 'spark:on' : 'spark:off',
            `spark:difficulty:${round.sparkDifficulty ?? 'balanced'}`,
            round.sparkDirectPlay ? 'spark:direct-play' : 'spark:policy-only',
            ...seotdaAuditLogEntries(round)
          ]
        });
        chipsBeforeMap.delete(user.email);
        saveNpcStacks(user.email, round);
        return json({ success: true, balance: result.after, round: publicOf(round), npcActions });
      }

      return json({
        success: true,
        balance: round.seats.find((s) => s.id === 'user')?.chips ?? 0,
        round: publicOf(round),
        npcActions
      });
    }

    if (action === 'ack') {
      // 쇼다운 확인 후 NPC 칩 유지한 채 다음 판
      const round = getRound(user.email);
      const openingActorId = round?.winnerId ?? 'user';
      const sparkTauntCooldown = sparkTauntCooldownAfterRound(round);
      if (round && round.phase === 'showdown') {
        saveNpcStacks(user.email, round);
        clearRound(user.email);
      }
      return json(await beginRound(user.email, user.nickname, openingActorId, sparkTauntCooldown));
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
 * @param {string} [openingActorId]
 * @param {number} [sparkTauntCooldown]
 */
async function beginRound(email, nickname, openingActorId = 'user', sparkTauntCooldown = 0) {
  let { balance } = await ensureSeotdaBalance(email, nickname);
  if (isSeotdaOopsBalance(balance)) {
    balance = (await resolveSeotdaOops(email, nickname, balance)).balance;
  }
  if (balance < 10) {
    throw error(400, { message: '보유 점수가 부족합니다. 오링 후 잠시 기다려 주세요.' });
  }
  const npcChips = getNpcStacks(email);
  const history = await getSeotdaSparkHistory(email);
  const sparkDecision = await decideSparkIntervention({
    balance,
    npcChips,
    openingActorId,
    sparkTauntCooldown,
    history
  });
  const round = createNewRound(
    balance,
    Math.random,
    npcChips,
    openingActorId,
    sparkTauntCooldown,
    sparkDecision
  );
  round.sparkHistory = history;
  const npcActions = await runNpcTurnsWithSpark(round, decideSparkNpcAction);
  chipsBeforeMap.set(email, balance);
  setRound(email, round);
  return { success: true, balance: round.seats[0].chips, round: publicOf(round), npcActions };
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
    return json({
      success: true,
      balance: round.seats[0].chips,
      round: publicOf(round),
      npcActions: []
    });
  }
  if (action === 'ack') {
    const prev = getRound(email);
    const openingActorId = prev?.winnerId ?? 'user';
    const sparkTauntCooldown = sparkTauntCooldownAfterRound(prev);
    if (prev) saveNpcStacks(email, prev);
    clearRound(email);
    const round = createNewRound(
      SMOKE_BALANCE,
      Math.random,
      getNpcStacks(email),
      openingActorId,
      sparkTauntCooldown
    );
    const npcActions = runNpcTurns(round);
    chipsBeforeMap.set(email, SMOKE_BALANCE);
    setRound(email, round);
    return json({
      success: true,
      balance: round.seats[0].chips,
      round: publicOf(round),
      npcActions
    });
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
    const npcActions = runNpcTurns(round);
    setRound(email, round);
    const userChips = round.seats.find((s) => s.id === 'user')?.chips ?? 0;
    return json({ success: true, balance: userChips, round: publicOf(round), npcActions });
  }
  throw error(400, { message: 'action: start | act | ack' });
}

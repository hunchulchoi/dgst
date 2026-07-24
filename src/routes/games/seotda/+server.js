import { error, json } from '@sveltejs/kit';
import { checkRateLimit } from '$lib/server/apiRateLimit.js';
import { getGameSession, isLocalGameSmokeSession } from '$lib/server/localGameSmokeSession.js';
import {
  ensureSeotdaBalance,
  didSeotdaTakeLead,
  didSeotdaPromoteLeader,
  getSeotdaCurrentLeader,
  getSeotdaRank,
  getSeotdaSparkHistory,
  getTodaySeotdaStats,
  isSeotdaOopsBalance,
  resolveSeotdaOops,
  shouldRequestSparkDecision,
  shouldForceSparkForRaise,
  sparkDecisionCooldownMs,
  sparkInterventionHands,
  writeSeotdaLeaderPromotion,
  writeSeotdaScore
} from './seotdaBalance.js';
import {
  clearRound,
  getRound,
  setRound,
  toPublicState,
  getNpcStacks,
  getNpcEmotions,
  getSeotdaSeriesRoundConfig,
  saveNpcStacks,
  saveNpcEmotions,
  saveSeotdaSeries,
  resetNpcStacks,
  resetNpcEmotions,
  resetSeotdaSeries
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
import { displayHand, normalizeRuleMode } from './seotdaClassic.js';

const SMOKE_BALANCE = 1000;

/** @type {Map<string, number>} */
const chipsBeforeMap = new Map();
/** @type {Map<string, { decision: Record<string, unknown> | null; consumed: boolean; remainingHands: number; refreshAfter: number; pending?: Promise<void>; touchedAt: number }>} */
const sparkDecisionCache = new Map();

/** @param {string} email */
function consumeSparkDecision(email) {
  const cached = sparkDecisionCache.get(email);
  if (!cached?.decision || cached.consumed || cached.remainingHands <= 0) return null;
  cached.remainingHands -= 1;
  cached.consumed = cached.remainingHands <= 0;
  cached.touchedAt = Date.now();
  return cached.decision;
}

/** @param {string} email @param {Record<string, unknown>} context */
function refreshSparkDecisionInBackground(email, context, force = false) {
  const now = Date.now();
  const cached = sparkDecisionCache.get(email);
  if (cached?.pending) return cached.pending;
  if (!force && cached && now < cached.refreshAfter) return null;
  if (
    !force &&
    !shouldRequestSparkDecision(Number(context.balance ?? 0), /** @type {any} */ (context.history))
  ) {
    return null;
  }

  if (sparkDecisionCache.size > 500) {
    for (const [key, value] of sparkDecisionCache) {
      if (now - value.touchedAt > 30 * 60_000) sparkDecisionCache.delete(key);
    }
  }

  const pending = decideSparkIntervention(context)
    .then((decision) => {
      // 직접 행동 호출은 피하고, 한 번 받은 난이도·성향 정책을 여러 판 재사용한다.
      decision.directPlay = false;
      const remainingHands = sparkInterventionHands(
        Number(context.balance ?? 0),
        /** @type {any} */ (context.history),
        decision
      );
      sparkDecisionCache.set(email, {
        decision: remainingHands > 0 ? decision : null,
        consumed: remainingHands <= 0,
        remainingHands,
        refreshAfter:
          Date.now() +
          sparkDecisionCooldownMs(
            Number(context.balance ?? 0),
            /** @type {any} */ (context.history),
            decision.active
          ),
        touchedAt: Date.now()
      });
    })
    .catch(() => {
      sparkDecisionCache.set(email, {
        decision: null,
        consumed: true,
        remainingHands: 0,
        refreshAfter:
          Date.now() +
          sparkDecisionCooldownMs(
            Number(context.balance ?? 0),
            /** @type {any} */ (context.history),
            false
          ),
        touchedAt: Date.now()
      });
    });
  sparkDecisionCache.set(email, {
    decision: cached?.decision ?? null,
    consumed: cached?.consumed ?? true,
    remainingHands: cached?.remainingHands ?? 0,
    refreshAfter: cached?.refreshAfter ?? 0,
    pending,
    touchedAt: now
  });
  return pending;
}

/**
 * @param {import('./seotdaState.js').SeotdaRound} round
 */
function publicOf(round) {
  return toPublicState(round, 'user', (cards) => displayHand(cards, round.ruleMode));
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
      if (getRound(user.email)) {
        throw error(400, { message: '진행 중이거나 확인하지 않은 판이 있습니다.' });
      }
      // 새 테이블: NPC 칩 초기화
      const prev = getRound(user.email);
      const openingActorId = prev?.winnerId ?? 'user';
      const sparkTauntCooldown = sparkTauntCooldownAfterRound(prev);
      if (prev) saveNpcStacks(user.email, prev);
      clearRound(user.email);
      const ruleMode = normalizeRuleMode(body?.ruleMode);
      const eventMode = body?.eventMode === true;
      return json(
        await beginRound(
          user.email,
          user.nickname,
          openingActorId,
          sparkTauntCooldown,
          ruleMode,
          eventMode
        )
      );
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
      const appliedRaisePay = Number(userSeat?.lastActionAmount ?? 0);
      if (shouldForceSparkForRaise(move, appliedRaisePay)) {
        round.log.push(`Spark: 10억 이상 레이스 판단 요청 (${appliedRaisePay})`);
        void refreshSparkDecisionInBackground(
          user.email,
          {
            balance: Number(userSeat?.chips ?? 0) + Number(userSeat?.totalContrib ?? 0),
            npcChips: Object.fromEntries(
              round.seats.filter((seat) => seat.isNpc).map((seat) => [seat.id, seat.chips])
            ),
            openingActorId: round.openingActorId ?? 'user',
            sparkTauntCooldown: Number(round.sparkTauntCooldown ?? 0),
            history: round.sparkHistory ?? {},
            trigger: 'user-high-raise',
            highRaisePay: appliedRaisePay,
            pot: round.pot,
            currentBet: round.currentBet,
            raiseCount: round.raiseCount ?? 0,
            userRaiseCount: round.userRaiseCount ?? 0
          },
          true
        );
      }
      const npcActions = await runNpcTurnsWithSpark(round, decideSparkNpcAction);
      setRound(user.email, round);

      if (round.phase === 'showdown') {
        const before = chipsBeforeMap.get(user.email) ?? round.seats[0].chips;
        const result = userChipResult(before, round);
        round.userChipsBefore = before;
        round.userChipsAfter = result.after;
        round.userChipDelta = result.delta;
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
        const leaderAfter = await getSeotdaCurrentLeader();
        if (didSeotdaPromoteLeader(leaderBefore, leaderAfter, user.email) && leaderAfter) {
          await writeSeotdaLeaderPromotion(leaderAfter);
        }
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
      if (!round || round.phase !== 'showdown') {
        throw error(400, { message: '끝난 판에서 다음 판을 눌러야 새 패를 돌릴 수 있습니다.' });
      }
      const openingActorId = round?.winnerId ?? 'user';
      const sparkTauntCooldown = sparkTauntCooldownAfterRound(round);
      if (round && round.phase === 'showdown') {
        saveNpcStacks(user.email, round);
        saveNpcEmotions(user.email, round);
        saveSeotdaSeries(user.email, round);
        clearRound(user.email);
      }
      return json(
        await beginRound(
          user.email,
          user.nickname,
          openingActorId,
          sparkTauntCooldown,
          normalizeRuleMode(round.ruleMode),
          !!round.eventMode
        )
      );
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
async function beginRound(
  email,
  nickname,
  openingActorId = 'user',
  sparkTauntCooldown = 0,
  ruleMode = 'basic',
  eventMode = false
) {
  let { balance } = await ensureSeotdaBalance(email, nickname);
  if (isSeotdaOopsBalance(balance)) {
    balance = (await resolveSeotdaOops(email, nickname, balance)).balance;
  }
  if (balance < 10) {
    throw error(400, { message: '보유 점수가 부족합니다. 오링 후 잠시 기다려 주세요.' });
  }
  const npcChips = getNpcStacks(email);
  const npcEmotions = getNpcEmotions(email);
  const seriesConfig = getSeotdaSeriesRoundConfig(email);
  const history = await getSeotdaSparkHistory(email);
  const sparkContext = {
    balance,
    npcChips,
    openingActorId,
    sparkTauntCooldown,
    history
  };
  const sparkDecision = consumeSparkDecision(email);
  void refreshSparkDecisionInBackground(email, sparkContext);
  const round = createNewRound(
    balance,
    Math.random,
    npcChips,
    openingActorId,
    sparkTauntCooldown,
    sparkDecision,
    npcEmotions,
    seriesConfig,
    ruleMode,
    eventMode
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
    if (getRound(email)) {
      throw error(400, { message: '진행 중이거나 확인하지 않은 판이 있습니다.' });
    }
    clearRound(email);
    resetNpcStacks(email);
    resetNpcEmotions(email);
    resetSeotdaSeries(email);
    const ruleMode = normalizeRuleMode(body?.ruleMode);
    const eventMode = body?.eventMode === true;
    const round = createNewRound(
      SMOKE_BALANCE,
      Math.random,
      {},
      'user',
      0,
      null,
      {},
      getSeotdaSeriesRoundConfig(email),
      ruleMode,
      eventMode
    );
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
    if (!prev || prev.phase !== 'showdown') {
      throw error(400, { message: '끝난 판에서 다음 판을 눌러야 새 패를 돌릴 수 있습니다.' });
    }
    const openingActorId = prev?.winnerId ?? 'user';
    const sparkTauntCooldown = sparkTauntCooldownAfterRound(prev);
    if (prev) saveNpcStacks(email, prev);
    if (prev) saveNpcEmotions(email, prev);
    if (prev) saveSeotdaSeries(email, prev);
    clearRound(email);
    const round = createNewRound(
      SMOKE_BALANCE,
      Math.random,
      getNpcStacks(email),
      openingActorId,
      sparkTauntCooldown,
      null,
      getNpcEmotions(email),
      getSeotdaSeriesRoundConfig(email),
      normalizeRuleMode(prev.ruleMode),
      !!prev.eventMode
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
    if (round.phase === 'showdown') {
      const before = chipsBeforeMap.get(email) ?? SMOKE_BALANCE;
      const result = userChipResult(before, round);
      round.userChipsBefore = before;
      round.userChipsAfter = result.after;
      round.userChipDelta = result.delta;
    }
    return json({ success: true, balance: userChips, round: publicOf(round), npcActions });
  }
  throw error(400, { message: 'action: start | act | ack' });
}

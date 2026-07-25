import { getPrisma } from '$lib/database/prisma.js';
import {
  applyArcadeEntries,
  applyArcadeEntry,
  ensureArcadeWallet,
  getArcadeBalance,
  getArcadeLeader,
  getArcadeRank,
  resolveArcadeOops
} from '$lib/server/arcadeWallet.js';
import { ANTE, SEOTDA_GAME } from './seotdaEngine.js';

export const SPARK_HIGH_RAISE_TRIGGER = 1_000_000_000;

/** @param {string} action @param {number} amount */
export function shouldForceSparkForRaise(action, amount) {
  return action === 'raise' && Number(amount) >= SPARK_HIGH_RAISE_TRIGGER;
}

export const SEOTDA_INITIAL = 1000;
export const SEOTDA_OOPS_TOPUP = 700;
export const SEOTDA_OOPS_DELAY_MS = 5 * 60 * 1000;
export const SEOTDA_LEADER_EVENT_GAME = 'seotda-leader';

const KST_OFFSET_MINUTES = 9 * 60;

/** @param {number} balance */
export function isSeotdaOopsBalance(balance) {
  return Number(balance) < ANTE;
}

/**
 * @param {Date | string} createdAt
 * @param {number} [now]
 */
export function getSeotdaOopsTiming(createdAt, now = Date.now()) {
  const createdAtDate = new Date(createdAt);
  const remainingMs = Math.max(0, SEOTDA_OOPS_DELAY_MS - (now - createdAtDate.getTime()));
  return {
    createdAt: createdAtDate.toISOString(),
    remainingMs,
    ready: remainingMs === 0
  };
}

/**
 * @param {Date} [baseDate]
 * @returns {Date}
 */
function getKstStartOfDay(baseDate = new Date()) {
  const utcTime = baseDate.getTime() + baseDate.getTimezoneOffset() * 60_000;
  const kstDate = new Date(utcTime + KST_OFFSET_MINUTES * 60_000);
  kstDate.setHours(0, 0, 0, 0);
  return new Date(kstDate.getTime() - KST_OFFSET_MINUTES * 60_000);
}

/**
 * @param {string} email
 * @returns {Promise<number>}
 */
export async function getSeotdaBalance(email) {
  try {
    return await getArcadeBalance(email);
  } catch (err) {
    console.error('[seotda getSeotdaBalance]', err);
    return 0;
  }
}

/**
 * @param {string} email
 * @param {string} nickname
 * @param {number} balance
 * @param {{ bet?: number; payout?: number; delta?: number; playId?: string; reels?: string[] }} [meta]
 */
export async function writeSeotdaScore(email, nickname, balance, meta = {}) {
  try {
    const bet = Number(meta.bet ?? 0);
    const payout = Number(meta.payout ?? 0);
    const delta = Number(meta.delta ?? payout - bet);
    return await applyArcadeEntry(email, nickname, {
      game: SEOTDA_GAME,
      kind: bet > 0 ? 'play' : meta.reels?.[0] === 'comment' ? 'comment-reward' : 'adjustment',
      bet,
      payout,
      delta,
      playId: meta.playId,
      reels: meta.reels ?? ['-', '-', '-'],
      meta: { requestedBalance: balance }
    });
  } catch (err) {
    console.error('[seotda writeSeotdaScore]', err);
    throw err;
  }
}

/**
 * 승부 손실과 개평을 한 트랜잭션에 별도 기록한다.
 * @param {string} email
 * @param {string} nickname
 * @param {{ balance: number; bet: number; payout: number; delta: number; playId?: string; reels: string[] }} hand
 * @param {{ balance: number; amount: number; loss: number } | null} gaepyeong
 */
export async function writeSeotdaSettlement(email, nickname, hand, gaepyeong) {
  try {
    const entries = [
      {
        game: SEOTDA_GAME,
        kind: 'play',
        bet: hand.bet,
        payout: hand.payout,
        delta: hand.delta,
        playId: hand.playId,
        reels: hand.reels,
        meta: { requestedBalance: hand.balance }
      }
    ];
    if (gaepyeong?.amount) {
      entries.push({
        game: SEOTDA_GAME,
        kind: 'gaepyeong',
        bet: 0,
        payout: gaepyeong.amount,
        delta: gaepyeong.amount,
        reels: ['gaepyeong', String(gaepyeong.amount), `loss:${gaepyeong.loss}`],
        meta: { requestedBalance: gaepyeong.balance }
      });
    }
    return await applyArcadeEntries(email, nickname, entries);
  } catch (err) {
    console.error('[seotda writeSeotdaSettlement]', err);
    throw err;
  }
}

/**
 * 기록 없으면 1000 지급
 * @param {string} email
 * @param {string} nickname
 * @returns {Promise<{ balance: number; granted: boolean }>}
 */
export async function ensureSeotdaBalance(email, nickname) {
  try {
    const wallet = await ensureArcadeWallet(email, nickname);
    return { balance: Number(wallet.balance), granted: false };
  } catch (err) {
    console.error('[seotda ensureSeotdaBalance]', err);
    throw err;
  }
}

/**
 * 오링 5분 후 700 보충
 * @param {string} email
 * @param {string} nickname
 * @returns {Promise<{
 *   balance: number;
 *   oopsInfo: { createdAt: string; remainingMs: number; waiting: true } | null;
 * }>}
 */
export async function resolveSeotdaOops(email, nickname, currentBalance = 0) {
  try {
    if (currentBalance >= ANTE) return { balance: currentBalance, oopsInfo: null };
    return await resolveArcadeOops(email, nickname, SEOTDA_GAME);
  } catch (err) {
    console.error('[seotda resolveSeotdaOops]', err);
    return { balance: currentBalance, oopsInfo: null };
  }
}

/**
 * 현재 섯다 1등. 동점이면 가장 최근에 해당 잔고를 기록한 사용자를 우선한다.
 * @returns {Promise<{ email: string; nickname: string; balance: number } | null>}
 */
export async function getSeotdaCurrentLeader() {
  try {
    return await getArcadeLeader();
  } catch (err) {
    console.error('[seotda getSeotdaCurrentLeader]', err);
    return null;
  }
}

/**
 * @param {{ email: string; balance: number } | null} leaderBefore
 * @param {string} userEmail
 * @param {number} balanceAfter
 */
export function didSeotdaTakeLead(leaderBefore, userEmail, balanceAfter) {
  return !!leaderBefore && leaderBefore.email !== userEmail && balanceAfter > leaderBefore.balance;
}

/**
 * 정산한 기존 1등이 내려가면서 다른 사용자가 자동 승격했는지 판별한다.
 * @param {{ email: string } | null} leaderBefore
 * @param {{ email: string } | null} leaderAfter
 * @param {string} settledUserEmail
 */
export function didSeotdaPromoteLeader(leaderBefore, leaderAfter, settledUserEmail) {
  return !!(
    leaderBefore &&
    leaderAfter &&
    leaderBefore.email === settledUserEmail &&
    leaderAfter.email !== leaderBefore.email
  );
}

/**
 * 랭킹·Spark 게임 이력을 오염시키지 않는 전용 1등 승격 축하 이벤트.
 * @param {{ email: string; nickname: string; balance: number }} leader
 */
export async function writeSeotdaLeaderPromotion(leader) {
  return getPrisma().gameScore.create({
    data: {
      email: leader.email,
      nickname: leader.nickname,
      game: SEOTDA_LEADER_EVENT_GAME,
      bet: 0,
      payout: 0,
      delta: 0,
      balance: leader.balance,
      reels: ['lead', 'promotion', '-']
    }
  });
}

/**
 * @returns {Promise<Array<{ nickname: string; balance: number; email: string; updatedAt: string | null }>>}
 */
export async function getSeotdaRank(limit = 10) {
  try {
    return await getArcadeRank(limit);
  } catch (err) {
    console.error('[seotda getSeotdaRank]', err);
    return [];
  }
}

/**
 * 오늘(KST) 섯다 참여자·판수 (실제 판 bet>0)
 * @returns {Promise<{ hands: number; users: number }>}
 */
export async function getTodaySeotdaStats() {
  try {
    const startOfKstDay = getKstStartOfDay();
    const where = {
      game: SEOTDA_GAME,
      bet: { gt: 0 },
      createdAt: { gte: startOfKstDay }
    };
    const [hands, distinctUsers] = await Promise.all([
      getPrisma().gameScore.count({ where }),
      getPrisma().gameScore.groupBy({
        by: ['email'],
        where
      })
    ]);
    return {
      hands,
      users: distinctUsers.length
    };
  } catch (err) {
    console.error('[seotda getTodaySeotdaStats]', err);
    return { hands: 0, users: 0 };
  }
}

/**
 * DB 최신순 섯다 기록을 Spark 판단용 집계로 축약한다.
 * @param {Array<{ bet: bigint | number; delta: bigint | number; balance: bigint | number; reels: string[] }>} rows
 */
export function summarizeSeotdaSparkHistory(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const totalDelta = safeRows.reduce((sum, row) => sum + Number(row.delta ?? 0), 0);
  const recentRows = safeRows.slice(0, 10);
  const recent10Delta = recentRows.reduce((sum, row) => sum + Number(row.delta ?? 0), 0);
  const wins = safeRows.filter((row) => row.reels?.[0] === 'win').length;
  const sparkHands = safeRows.filter((row) => row.reels?.includes('spark:on')).length;
  const oldest = safeRows.at(-1);
  const recentOldest = recentRows.at(-1);
  const startingBalance = oldest
    ? Math.max(1, Number(oldest.balance ?? 0) - Number(oldest.delta ?? 0))
    : 1;
  const recentStartingBalance = recentOldest
    ? Math.max(1, Number(recentOldest.balance ?? 0) - Number(recentOldest.delta ?? 0))
    : 1;
  let consecutiveFolds = 0;
  let consecutiveMaxRaises = 0;
  let consecutiveSparkHands = 0;
  for (const row of safeRows) {
    if (row.reels?.[2] === '다이') consecutiveFolds += 1;
    else break;
  }
  for (const row of safeRows) {
    if (row.reels?.includes('user:max-raise')) consecutiveMaxRaises += 1;
    else break;
  }
  for (const row of safeRows) {
    if (row.reels?.includes('spark:on')) consecutiveSparkHands += 1;
    else break;
  }
  return {
    hands: safeRows.length,
    wins,
    winRatePercent: safeRows.length ? Math.round((wins / safeRows.length) * 10_000) / 100 : 0,
    totalDelta,
    balanceGrowthPercent: Math.round((totalDelta / startingBalance) * 10_000) / 100,
    recent10Delta,
    recent10GrowthPercent: Math.round((recent10Delta / recentStartingBalance) * 10_000) / 100,
    consecutiveFolds,
    consecutiveMaxRaises,
    sparkHands,
    consecutiveSparkHands
  };
}

/**
 * Spark가 선택한 정책을 재호출 없이 유지할 판 수.
 * @param {number} balance
 * @param {{ recent10Delta?: number; recent10GrowthPercent?: number } | null | undefined} history
 * @param {{ active?: boolean; difficulty?: string } | null | undefined} decision
 */
export function sparkInterventionHands(balance, history, decision) {
  if (!decision?.active) return 0;
  const bankroll = Math.max(0, Number(balance) || 0);
  if (bankroll < 100_000) return 1;

  const rapidProfit =
    Number(history?.recent10GrowthPercent ?? 0) >= 10 ||
    Number(history?.recent10Delta ?? 0) >= Math.max(10_000, bankroll * 0.08);
  if (decision.difficulty === 'challenge' && (bankroll >= 200_000 || rapidProfit)) return 3;
  return 2;
}

/**
 * 저잔고는 정기 감독을 20판마다만 요청하고, 명확한 이상 흐름만 조기 감독한다.
 * @param {number} balance
 * @param {{ hands?: number; consecutiveFolds?: number; consecutiveMaxRaises?: number } | null | undefined} history
 */
export function shouldRequestSparkDecision(balance, history) {
  if (Number(balance) >= 100_000) return true;
  if (
    Number(history?.consecutiveFolds ?? 0) >= 5 ||
    Number(history?.consecutiveMaxRaises ?? 0) >= 3
  ) {
    return true;
  }
  const hands = Math.max(0, Number(history?.hands ?? 0) || 0);
  return hands > 0 && hands % 20 === 0;
}

/**
 * @param {number} balance
 * @param {{ consecutiveFolds?: number; consecutiveMaxRaises?: number } | null | undefined} history
 * @param {boolean} active
 */
export function sparkDecisionCooldownMs(balance, history, active) {
  if (Number(balance) >= 100_000) return active ? 30_000 : 3 * 60_000;
  const abnormal =
    Number(history?.consecutiveFolds ?? 0) >= 5 || Number(history?.consecutiveMaxRaises ?? 0) >= 3;
  return abnormal ? 10 * 60_000 : 30 * 60_000;
}

/** @param {string} email @param {number} [limit] */
export async function getSeotdaSparkHistory(email, limit = 100) {
  try {
    const rows = await getPrisma().gameScore.findMany({
      where: { email, game: SEOTDA_GAME, bet: { gt: 0 } },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(100, Number(limit) || 100)),
      select: { bet: true, delta: true, balance: true, reels: true }
    });
    return summarizeSeotdaSparkHistory(rows);
  } catch (err) {
    console.error('[seotda getSeotdaSparkHistory]', err);
    return summarizeSeotdaSparkHistory([]);
  }
}

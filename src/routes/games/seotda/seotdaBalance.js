import { getPrisma } from '$lib/database/prisma.js';
import { normalizeToIsoString } from '$lib/util/formatRelativeTime.js';
import { SEOTDA_GAME } from './seotdaEngine.js';

export const SEOTDA_INITIAL = 1000;
export const SEOTDA_OOPS_TOPUP = 700;
export const SEOTDA_OOPS_DELAY_MS = 5 * 60 * 1000;

const KST_OFFSET_MINUTES = 9 * 60;

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
    const last = await getPrisma().gameScore.findFirst({
      where: { email, game: SEOTDA_GAME },
      orderBy: { createdAt: 'desc' },
      select: { balance: true }
    });
    return Number(last?.balance ?? 0);
  } catch (err) {
    console.error('[seotda getSeotdaBalance]', err);
    return 0;
  }
}

/**
 * @param {string} email
 * @param {string} nickname
 * @param {number} balance
 * @param {{ bet?: number; payout?: number; delta?: number; reels?: string[] }} [meta]
 */
export async function writeSeotdaScore(email, nickname, balance, meta = {}) {
  try {
    const bet = Number(meta.bet ?? 0);
    const payout = Number(meta.payout ?? 0);
    const delta = Number(meta.delta ?? payout - bet);
    return await getPrisma().gameScore.create({
      data: {
        email,
        nickname,
        game: SEOTDA_GAME,
        bet,
        payout,
        delta,
        balance,
        reels: meta.reels ?? ['-', '-', '-']
      }
    });
  } catch (err) {
    console.error('[seotda writeSeotdaScore]', err);
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
    const last = await getPrisma().gameScore.findFirst({
      where: { email, game: SEOTDA_GAME },
      orderBy: { createdAt: 'desc' }
    });
    if (!last) {
      await writeSeotdaScore(email, nickname, SEOTDA_INITIAL, {
        bet: 0,
        payout: SEOTDA_INITIAL,
        delta: SEOTDA_INITIAL,
        reels: ['init', String(SEOTDA_INITIAL), '-']
      });
      return { balance: SEOTDA_INITIAL, granted: true };
    }
    return { balance: Number(last.balance), granted: false };
  } catch (err) {
    console.error('[seotda ensureSeotdaBalance]', err);
    throw err;
  }
}

/**
 * 오링 5분 후 700 보충
 * @param {string} email
 * @param {string} nickname
 * @returns {Promise<number>} topped balance or 0
 */
export async function maybeTopupAfterOops(email, nickname) {
  try {
    const prisma = getPrisma();
    const lastOops = await prisma.gameScore.findFirst({
      where: { email, game: SEOTDA_GAME, bet: { gt: 0 }, balance: 0 },
      orderBy: { createdAt: 'desc' }
    });
    if (!lastOops) return 0;

    const after = await prisma.gameScore.findFirst({
      where: {
        email,
        game: SEOTDA_GAME,
        createdAt: { gt: lastOops.createdAt },
        balance: { gt: 0 }
      },
      orderBy: { createdAt: 'desc' }
    });
    if (after) return Number(after.balance);

    const elapsed = Date.now() - new Date(lastOops.createdAt).getTime();
    if (elapsed < SEOTDA_OOPS_DELAY_MS) return 0;

    await writeSeotdaScore(email, nickname, SEOTDA_OOPS_TOPUP, {
      bet: 0,
      payout: SEOTDA_OOPS_TOPUP,
      delta: SEOTDA_OOPS_TOPUP,
      reels: ['oops', String(SEOTDA_OOPS_TOPUP), '-']
    });
    return SEOTDA_OOPS_TOPUP;
  } catch (err) {
    console.error('[seotda maybeTopupAfterOops]', err);
    return 0;
  }
}

/**
 * 현재 섯다 1등. 동점이면 가장 최근에 해당 잔고를 기록한 사용자를 우선한다.
 * @returns {Promise<{ email: string; balance: number } | null>}
 */
export async function getSeotdaCurrentLeader() {
  try {
    /** @type {Array<{ email: string; balance: number; createdAt: Date }>} */
    const rows = await getPrisma().$queryRaw`
      SELECT email, balance, "createdAt"
      FROM (
        SELECT
          email,
          balance,
          created_at AS "createdAt",
          ROW_NUMBER() OVER (PARTITION BY email ORDER BY created_at DESC) AS rn
        FROM game_scores
        WHERE game = ${SEOTDA_GAME}
      ) t
      WHERE rn = 1 AND balance > 0
      ORDER BY balance DESC, "createdAt" DESC
      LIMIT 1
    `;
    return rows[0] ? { email: rows[0].email, balance: Number(rows[0].balance) } : null;
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
 * @returns {Promise<Array<{ nickname: string; balance: number; email: string; updatedAt: string | null }>>}
 */
export async function getSeotdaRank(limit = 10) {
  try {
    /** @type {Array<{ email: string; nickname: string; balance: number; createdAt: Date }>} */
    const rows = await getPrisma().$queryRaw`
      SELECT email, nickname, balance, "createdAt"
      FROM (
        SELECT
          email,
          nickname,
          balance,
          created_at AS "createdAt",
          ROW_NUMBER() OVER (PARTITION BY email ORDER BY created_at DESC) AS rn
        FROM game_scores
        WHERE game = ${SEOTDA_GAME}
      ) t
      WHERE rn = 1 AND balance > 0
      ORDER BY balance DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      email: r.email,
      nickname: r.nickname,
      balance: Number(r.balance),
      updatedAt: normalizeToIsoString(r.createdAt)
    }));
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

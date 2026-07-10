import { getPrisma } from '$lib/database/prisma.js';
import { SEOTDA_GAME } from './seotdaEngine.js';

export const SEOTDA_INITIAL = 1000;
export const SEOTDA_OOPS_TOPUP = 700;
export const SEOTDA_OOPS_DELAY_MS = 5 * 60 * 1000;

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
 * @returns {Promise<Array<{ nickname: string; balance: number; email: string }>>}
 */
export async function getSeotdaRank(limit = 10) {
  try {
    /** @type {Array<{ email: string; nickname: string; balance: number }>} */
    const rows = await getPrisma().$queryRaw`
      SELECT email, nickname, balance
      FROM (
        SELECT
          email,
          nickname,
          balance::int AS balance,
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
      balance: Number(r.balance)
    }));
  } catch (err) {
    console.error('[seotda getSeotdaRank]', err);
    return [];
  }
}

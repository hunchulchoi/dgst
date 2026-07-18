import { getPrisma } from '$lib/database/prisma.js';
import { normalizeToIsoString } from '$lib/util/formatRelativeTime.js';
import { INITIAL_BALANCE, MIN_BET, SSAMCHI_GAME } from './ssamchiEngine.js';

export const OOPS_TOPUP = 500;
export const OOPS_DELAY_MS = 5 * 60_000;

/** @param {Date} [baseDate] */
function startOfKstDay(baseDate = new Date()) {
  const shifted = new Date(baseDate.getTime() + 9 * 60 * 60_000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - 9 * 60 * 60_000);
}

/** @param {string} email @param {string} nickname */
export async function ensureSsamchiBalance(email, nickname) {
  const prisma = getPrisma();
  const last = await prisma.gameScore.findFirst({
    where: { email, game: SSAMCHI_GAME },
    orderBy: { createdAt: 'desc' }
  });
  if (last) return { balance: Number(last.balance), oopsInfo: null };

  await writeSsamchiScore(email, nickname, INITIAL_BALANCE, {
    payout: INITIAL_BALANCE,
    delta: INITIAL_BALANCE,
    reels: ['init', String(INITIAL_BALANCE)]
  });
  return { balance: INITIAL_BALANCE, oopsInfo: null };
}

/** 직전 승자가 다음 판의 선. 첫 판은 NPC가 선이다. @param {string} email */
export async function getSsamchiHost(email) {
  const last = await getPrisma().gameScore.findFirst({
    where: { email, game: SSAMCHI_GAME, bet: { gt: 0 } },
    orderBy: { createdAt: 'desc' },
    select: { reels: true }
  });
  return last?.reels.find((entry) => entry.startsWith('next-host:')) === 'next-host:user'
    ? 'user'
    : 'npc';
}

/** @param {string} email @param {string} nickname @param {number} balance */
export async function resolveSsamchiOops(email, nickname, balance) {
  if (balance >= MIN_BET) return { balance, oopsInfo: null };
  const last = await getPrisma().gameScore.findFirst({
    where: { email, game: SSAMCHI_GAME },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true }
  });
  if (!last) return ensureSsamchiBalance(email, nickname);

  const remainingMs = Math.max(0, OOPS_DELAY_MS - (Date.now() - last.createdAt.getTime()));
  if (remainingMs > 0) {
    return {
      balance,
      oopsInfo: { remainingMs, readyAt: new Date(Date.now() + remainingMs).toISOString() }
    };
  }
  await writeSsamchiScore(email, nickname, OOPS_TOPUP, {
    payout: OOPS_TOPUP,
    delta: OOPS_TOPUP,
    reels: ['oops', String(OOPS_TOPUP)]
  });
  return { balance: OOPS_TOPUP, oopsInfo: null };
}

/**
 * @param {string} email
 * @param {string} nickname
 * @param {number} balance
 * @param {{ bet?: number; payout?: number; delta?: number; reels?: string[] }} [meta]
 */
export function writeSsamchiScore(email, nickname, balance, meta = {}) {
  return getPrisma().gameScore.create({
    data: {
      email,
      nickname,
      game: SSAMCHI_GAME,
      bet: Number(meta.bet ?? 0),
      payout: Number(meta.payout ?? 0),
      delta: Number(meta.delta ?? 0),
      balance,
      reels: meta.reels ?? ['-', '-']
    }
  });
}

export async function getSsamchiRank(limit = 10) {
  /** @type {Array<{ email: string; nickname: string; balance: bigint; createdAt: Date }>} */
  const rows = await getPrisma().$queryRaw`
    SELECT email, nickname, balance, "createdAt"
    FROM (
      SELECT email, nickname, balance, created_at AS "createdAt",
        ROW_NUMBER() OVER (PARTITION BY email ORDER BY created_at DESC) AS rn
      FROM game_scores
      WHERE game = ${SSAMCHI_GAME}
    ) t
    WHERE rn = 1
    ORDER BY balance DESC, "createdAt" DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    email: row.email,
    nickname: row.nickname,
    balance: Number(row.balance),
    updatedAt: normalizeToIsoString(row.createdAt)
  }));
}

export async function getTodaySsamchiStats() {
  const where = {
    game: SSAMCHI_GAME,
    bet: { gt: 0 },
    createdAt: { gte: startOfKstDay() }
  };
  const [hands, users] = await Promise.all([
    getPrisma().gameScore.count({ where }),
    getPrisma().gameScore.groupBy({ by: ['email'], where })
  ]);
  return { hands, users: users.length };
}

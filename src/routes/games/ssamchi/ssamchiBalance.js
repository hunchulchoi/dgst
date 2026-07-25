import { getPrisma } from '$lib/database/prisma.js';
import {
  applyArcadeEntry,
  ensureArcadeWallet,
  getArcadeRank,
  resolveArcadeOops
} from '$lib/server/arcadeWallet.js';
import { MIN_BET, SSAMCHI_GAME } from './ssamchiEngine.js';

export const OOPS_TOPUP = 700;
export const OOPS_DELAY_MS = 5 * 60_000;

/** @param {Date} [baseDate] */
function startOfKstDay(baseDate = new Date()) {
  const shifted = new Date(baseDate.getTime() + 9 * 60 * 60_000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - 9 * 60 * 60_000);
}

/** @param {string} email @param {string} nickname */
export async function ensureSsamchiBalance(email, nickname) {
  const wallet = await ensureArcadeWallet(email, nickname);
  return { balance: Number(wallet.balance), oopsInfo: null };
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
  return resolveArcadeOops(email, nickname, SSAMCHI_GAME);
}

/**
 * @param {string} email
 * @param {string} nickname
 * @param {number} balance
 * @param {{ bet?: number; payout?: number; delta?: number; playId?: string; reels?: string[] }} [meta]
 */
export function writeSsamchiScore(email, nickname, balance, meta = {}) {
  return applyArcadeEntry(email, nickname, {
    game: SSAMCHI_GAME,
    kind: meta.bet ? 'play' : meta.reels?.[0] === 'comment' ? 'comment-reward' : 'adjustment',
    bet: Number(meta.bet ?? 0),
    payout: Number(meta.payout ?? 0),
    delta: Number(meta.delta ?? 0),
    playId: meta.playId,
    reels: meta.reels ?? ['-', '-'],
    meta: { requestedBalance: balance }
  });
}

export async function getSsamchiRank(limit = 10) {
  return getArcadeRank(limit);
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

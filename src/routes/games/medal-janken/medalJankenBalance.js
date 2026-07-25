import { getPrisma } from '$lib/database/prisma.js';
import {
  applyArcadeEntry,
  ARCADE_INITIAL_BALANCE,
  ensureArcadeWallet,
  getArcadeRank
} from '$lib/server/arcadeWallet.js';

export const MEDAL_JANKEN_GAME = 'medal-janken';
export const INITIAL_MEDALS = ARCADE_INITIAL_BALANCE;

function startOfKstDay(baseDate = new Date()) {
  const shifted = new Date(baseDate.getTime() + 9 * 60 * 60_000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - 9 * 60 * 60_000);
}

/** @param {string} email @param {string} nickname */
export async function ensureMedalJankenBalance(email, nickname) {
  return Number((await ensureArcadeWallet(email, nickname)).balance);
}

/**
 * @param {string} email
 * @param {string} nickname
 * @param {number} balance
 * @param {{ bet?: number; payout?: number; delta?: number; playId?: string; reels?: string[] }} [meta]
 */
export function writeMedalJankenScore(email, nickname, balance, meta = {}) {
  return applyArcadeEntry(email, nickname, {
    game: MEDAL_JANKEN_GAME,
    kind: meta.bet ? 'play' : meta.reels?.[0] === 'comment' ? 'comment-reward' : 'adjustment',
    bet: Number(meta.bet ?? 0),
    payout: Number(meta.payout ?? 0),
    delta: Number(meta.delta ?? 0),
    playId: meta.playId,
    reels: meta.reels ?? ['-', '-'],
    meta: { requestedBalance: balance }
  });
}

export async function getMedalJankenRank(limit = 10) {
  return getArcadeRank(limit);
}

export async function getTodayMedalJankenStats() {
  const where = {
    game: MEDAL_JANKEN_GAME,
    bet: { gt: 0 },
    createdAt: { gte: startOfKstDay() }
  };
  const [hands, users] = await Promise.all([
    getPrisma().gameScore.count({ where }),
    getPrisma().gameScore.groupBy({ by: ['email'], where })
  ]);
  return { hands, users: users.length };
}

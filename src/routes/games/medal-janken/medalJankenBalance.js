import { getPrisma } from '$lib/database/prisma.js';
import { normalizeToIsoString } from '$lib/util/formatRelativeTime.js';
import { attachGameProfilePhotos } from '$lib/server/gameProfilePhotos.js';

export const MEDAL_JANKEN_GAME = 'medal-janken';
export const INITIAL_MEDALS = 100;

function startOfKstDay(baseDate = new Date()) {
  const shifted = new Date(baseDate.getTime() + 9 * 60 * 60_000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - 9 * 60 * 60_000);
}

/** @param {string} email @param {string} nickname */
export async function ensureMedalJankenBalance(email, nickname) {
  const last = await getPrisma().gameScore.findFirst({
    where: { email, game: MEDAL_JANKEN_GAME },
    orderBy: { createdAt: 'desc' }
  });
  if (last) return Number(last.balance);

  await writeMedalJankenScore(email, nickname, INITIAL_MEDALS, {
    payout: INITIAL_MEDALS,
    delta: INITIAL_MEDALS,
    reels: ['init', String(INITIAL_MEDALS)]
  });
  return INITIAL_MEDALS;
}

/**
 * @param {string} email
 * @param {string} nickname
 * @param {number} balance
 * @param {{ bet?: number; payout?: number; delta?: number; reels?: string[] }} [meta]
 */
export function writeMedalJankenScore(email, nickname, balance, meta = {}) {
  return getPrisma().gameScore.create({
    data: {
      email,
      nickname,
      game: MEDAL_JANKEN_GAME,
      bet: Number(meta.bet ?? 0),
      payout: Number(meta.payout ?? 0),
      delta: Number(meta.delta ?? 0),
      balance,
      reels: meta.reels ?? ['-', '-']
    }
  });
}

export async function getMedalJankenRank(limit = 10) {
  /** @type {Array<{ email: string; nickname: string; balance: bigint; createdAt: Date }>} */
  const rows = await getPrisma().$queryRaw`
    SELECT email, nickname, balance, "createdAt"
    FROM (
      SELECT email, nickname, balance, created_at AS "createdAt",
        ROW_NUMBER() OVER (PARTITION BY email ORDER BY created_at DESC) AS rn
      FROM game_scores
      WHERE game = ${MEDAL_JANKEN_GAME}
    ) t
    WHERE rn = 1
    ORDER BY balance DESC, "createdAt" DESC
    LIMIT ${limit}
  `;
  return attachGameProfilePhotos(
    rows.map((row) => ({
      email: row.email,
      nickname: row.nickname,
      balance: Number(row.balance),
      updatedAt: normalizeToIsoString(row.createdAt)
    }))
  );
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

import { getPrisma } from '$lib/database/prisma.js';
import { normalizeToIsoString } from '$lib/util/formatRelativeTime.js';
import { attachGameProfilePhotos } from '$lib/server/gameProfilePhotos.js';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

export const ARCADE_INITIAL_BALANCE = 1000;
export const ARCADE_OOPS_TOPUP = 700;
export const ARCADE_OOPS_DELAY_MS = 5 * 60_000;
export const ARCADE_MIN_PLAY_BALANCE = 10;
export const ARCADE_GAMES = ['slot', 'seotda', 'ssamchi', 'medal-janken'];
export const ARCADE_QUICK_PLAY_TTL_MS = 30_000;
export const ARCADE_ROUND_PLAY_TTL_MS = 15 * 60_000;
const ARCADE_LEADER_EVENT_KINDS = ['leader-baseline', 'leader-change'];

export class ArcadePlayConflictError extends Error {
  constructor(message = '다른 게임이 진행 중입니다.') {
    super(message);
    this.name = 'ArcadePlayConflictError';
  }
}

/**
 * 기존 게임별 최신 잔액에서 공용 지갑 초기값을 고른다.
 * @param {Array<number | bigint | null | undefined>} balances
 */
export function selectArcadeInitialBalance(balances) {
  const valid = balances.map(Number).filter((value) => Number.isSafeInteger(value) && value >= 0);
  return valid.length ? Math.max(...valid) : ARCADE_INITIAL_BALANCE;
}

/** @param {bigint | number} value */
function safeNumber(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new Error('공용 메달 값이 안전한 정수 범위를 벗어났습니다.');
  return number;
}

/**
 * 공용 메달 선두가 실제로 바뀐 경우에만 전용 원장을 남긴다.
 * 최초 관측은 baseline으로 저장해 현재 1등을 새 1등처럼 축하하지 않는다.
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} sourceGame
 */
export async function recordArcadeLeaderChange(tx, sourceGame) {
  if (typeof tx.$executeRaw === 'function') {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(20482048)`;
  }

  const leader = await tx.arcadeWallet.findFirst({
    where: { balance: { gt: 0 } },
    orderBy: [{ balance: 'desc' }, { createdAt: 'asc' }]
  });
  if (!leader) return null;

  const previous = await tx.arcadeLedger.findFirst({
    where: { kind: { in: ARCADE_LEADER_EVENT_KINDS } },
    orderBy: { createdAt: 'desc' }
  });
  if (previous?.email === leader.email) return null;

  return tx.arcadeLedger.create({
    data: {
      walletId: leader.id,
      email: leader.email,
      nickname: leader.nickname,
      game: ARCADE_GAMES.includes(sourceGame) ? sourceGame : 'arcade',
      kind: previous ? 'leader-change' : 'leader-baseline',
      delta: 0,
      balance: leader.balance,
      meta: { previousLeaderEmail: previous?.email ?? null }
    }
  });
}

/** @param {string} email @param {string} nickname */
export async function ensureArcadeWallet(email, nickname) {
  const prisma = getPrisma();
  const existing = await prisma.arcadeWallet.findUnique({ where: { email } });
  if (existing) {
    if (nickname && existing.nickname !== nickname) {
      return prisma.arcadeWallet.update({ where: { email }, data: { nickname } });
    }
    return existing;
  }

  const latest = await Promise.all(
    ARCADE_GAMES.map((game) =>
      prisma.gameScore.findFirst({
        where: { email, game },
        orderBy: { createdAt: 'desc' },
        select: { balance: true }
      })
    )
  );
  const balance = selectArcadeInitialBalance(latest.map((row) => row?.balance));
  const walletNickname = nickname || 'anonymous';
  try {
    return await prisma.$transaction(async (tx) => {
      const wallet = await tx.arcadeWallet.create({
        data: { email, nickname: walletNickname, balance }
      });
      await tx.arcadeLedger.create({
        data: {
          walletId: wallet.id,
          email,
          nickname: walletNickname,
          game: 'arcade',
          kind: latest.some(Boolean) ? 'migration' : 'initial-grant',
          payout: balance,
          delta: balance,
          balance,
          meta: {
            strategy: latest.some(Boolean) ? 'max-latest-game-balance' : 'new-wallet'
          }
        }
      });
      await recordArcadeLeaderChange(tx, 'arcade');
      return wallet;
    });
  } catch (error) {
    const concurrent = await prisma.arcadeWallet.findUnique({ where: { email } });
    if (concurrent) return concurrent;
    throw error;
  }
}

/** @param {string} email @param {string} [nickname] */
export async function getArcadeBalance(email, nickname = '') {
  const wallet = await ensureArcadeWallet(email, nickname);
  return safeNumber(wallet.balance);
}

/**
 * @typedef {{
 *   game: string;
 *   kind?: string;
 *   bet?: number;
 *   payout?: number;
 *   delta: number;
 *   playId?: string;
 *   reels?: string[];
 *   meta?: Record<string, unknown>;
 * }} ArcadeEntry
 */

/**
 * 여러 정산 항목을 한 트랜잭션에서 공용 지갑·원장·게임 기록에 반영한다.
 * @param {string} email
 * @param {string} nickname
 * @param {ArcadeEntry[]} entries
 */
export async function applyArcadeEntries(email, nickname, entries) {
  if (!entries.length) throw new Error('공용 메달 정산 항목이 없습니다.');
  await ensureArcadeWallet(email, nickname);
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    let wallet = await tx.arcadeWallet.findUniqueOrThrow({ where: { email } });
    const scores = [];

    for (const entry of entries) {
      const bet = Number(entry.bet ?? 0);
      const payout = Number(entry.payout ?? 0);
      const delta = Number(entry.delta);
      if (![bet, payout, delta].every(Number.isSafeInteger)) {
        throw new Error('공용 메달 정산값이 올바르지 않습니다.');
      }

      const required = BigInt(Math.max(bet, delta < 0 ? -delta : 0));
      const playId = entry.playId;
      const updated = await tx.arcadeWallet.updateMany({
        where: {
          email,
          balance: { gte: required },
          ...(playId ? { activePlayId: playId } : {})
        },
        data: {
          nickname,
          balance: { increment: BigInt(delta) },
          ...(playId
            ? {
                activeGame: null,
                activePlayId: null,
                activeUntil: null,
                activePayload: Prisma.DbNull
              }
            : {})
        }
      });
      if (updated.count !== 1) {
        if (playId) {
          throw new ArcadePlayConflictError(
            '게임 시작 후 잔액이 변경되었거나 다른 게임이 진행 중입니다.'
          );
        }
        throw new Error('보유 메달이 부족합니다.');
      }

      wallet = await tx.arcadeWallet.findUniqueOrThrow({ where: { email } });
      const balance = safeNumber(wallet.balance);
      const oopsAt =
        balance < ARCADE_MIN_PLAY_BALANCE && delta < 0
          ? (wallet.oopsAt ?? new Date())
          : balance >= ARCADE_MIN_PLAY_BALANCE
            ? null
            : wallet.oopsAt;
      if (oopsAt !== wallet.oopsAt) {
        wallet = await tx.arcadeWallet.update({ where: { email }, data: { oopsAt } });
      }

      const reels = entry.reels ?? ['-', '-'];
      const score = await tx.gameScore.create({
        data: {
          email,
          nickname,
          game: entry.game,
          bet,
          payout,
          delta,
          balance,
          reels
        }
      });
      scores.push(score);
      await tx.arcadeLedger.create({
        data: {
          walletId: wallet.id,
          email,
          nickname,
          game: entry.game,
          kind: entry.kind ?? (bet > 0 ? 'play' : 'adjustment'),
          bet,
          payout,
          delta,
          balance,
          meta: /** @type {import('@prisma/client').Prisma.InputJsonValue} */ (
            entry.meta ?? { reels }
          )
        }
      });
    }

    await recordArcadeLeaderChange(tx, entries.at(-1)?.game ?? 'arcade');
    return { balance: safeNumber(wallet.balance), wallet, scores };
  });
}

/**
 * @param {string} email
 * @param {string} nickname
 * @param {ArcadeEntry} entry
 */
export function applyArcadeEntry(email, nickname, entry) {
  return applyArcadeEntries(email, nickname, [entry]).then((result) => ({
    ...result,
    score: result.scores[0]
  }));
}

/**
 * 결과를 만들기 전에 공용 지갑을 원자적으로 잠근다.
 * @param {string} email
 * @param {string} nickname
 * @param {string} game
 * @param {number} bet
 * @param {number} [ttlMs]
 * @param {Record<string, unknown> | null} [payload]
 */
export async function beginArcadePlay(
  email,
  nickname,
  game,
  bet,
  ttlMs = ARCADE_QUICK_PLAY_TTL_MS,
  payload = null
) {
  if (!Number.isSafeInteger(bet) || bet < 0) throw new Error('베팅 금액이 올바르지 않습니다.');
  await ensureArcadeWallet(email, nickname);
  const prisma = getPrisma();
  const now = new Date();
  const playId = randomUUID();
  const activeUntil = new Date(now.getTime() + ttlMs);
  const claimed = await prisma.arcadeWallet.updateMany({
    where: {
      email,
      balance: { gte: BigInt(bet) },
      OR: [{ activePlayId: null }, { activeUntil: { lt: now } }]
    },
    data: {
      nickname,
      activeGame: game,
      activePlayId: playId,
      activeUntil,
      activePayload:
        payload === null
          ? Prisma.DbNull
          : /** @type {import('@prisma/client').Prisma.InputJsonValue} */ (payload)
    }
  });
  if (claimed.count !== 1) {
    const wallet = await prisma.arcadeWallet.findUniqueOrThrow({ where: { email } });
    if (safeNumber(wallet.balance) < bet) throw new Error('보유 메달이 부족합니다.');
    throw new ArcadePlayConflictError(
      `${wallet.activeGame ?? '다른 게임'}이 진행 중입니다. 판이 끝난 뒤 다시 시도해 주세요.`
    );
  }
  const wallet = await prisma.arcadeWallet.findUniqueOrThrow({ where: { email } });
  return { playId, balance: safeNumber(wallet.balance) };
}

/** @param {string} email @param {string} playId */
export async function getArcadePlay(email, playId) {
  const wallet = await getPrisma().arcadeWallet.findFirst({
    where: { email, activePlayId: playId, activeUntil: { gt: new Date() } },
    select: { activeGame: true, activePayload: true, balance: true }
  });
  if (!wallet) throw new ArcadePlayConflictError('게임 시작 정보가 만료되었습니다.');
  return {
    game: wallet.activeGame,
    payload: wallet.activePayload,
    balance: safeNumber(wallet.balance)
  };
}

/** @param {string} email @param {string} playId */
export async function releaseArcadePlay(email, playId) {
  await getPrisma().arcadeWallet.updateMany({
    where: { email, activePlayId: playId },
    data: {
      activeGame: null,
      activePlayId: null,
      activeUntil: null,
      activePayload: Prisma.DbNull
    }
  });
}

/**
 * 공용 오링 타이머를 확인하고 5분 뒤 지갑을 700개로 복구한다.
 * @param {string} email
 * @param {string} nickname
 * @param {string} sourceGame
 * @returns {Promise<{
 *   balance: number;
 *   oopsInfo: null | {
 *     createdAt?: string;
 *     readyAt?: string;
 *     remainingMs: number;
 *     waiting?: true;
 *   };
 * }>}
 */
export async function resolveArcadeOops(email, nickname, sourceGame) {
  let wallet = await ensureArcadeWallet(email, nickname);
  let balance = safeNumber(wallet.balance);
  if (balance >= ARCADE_MIN_PLAY_BALANCE) {
    if (wallet.oopsAt) {
      wallet = await getPrisma().arcadeWallet.update({
        where: { email },
        data: { oopsAt: null }
      });
    }
    return { balance: safeNumber(wallet.balance), oopsInfo: null };
  }

  if (!wallet.oopsAt) {
    wallet = await getPrisma().arcadeWallet.update({
      where: { email },
      data: { oopsAt: new Date() }
    });
  }
  const oopsAt = wallet.oopsAt ?? new Date();
  const remainingMs = Math.max(0, ARCADE_OOPS_DELAY_MS - (Date.now() - oopsAt.getTime()));
  if (remainingMs > 0) {
    return {
      balance,
      oopsInfo: {
        createdAt: oopsAt.toISOString(),
        readyAt: new Date(oopsAt.getTime() + ARCADE_OOPS_DELAY_MS).toISOString(),
        remainingMs,
        waiting: true
      }
    };
  }

  const prisma = getPrisma();
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.arcadeWallet.findUniqueOrThrow({ where: { email } });
    const currentBalance = safeNumber(current.balance);
    if (currentBalance >= ARCADE_MIN_PLAY_BALANCE || !current.oopsAt) return current;

    const claimed = await tx.arcadeWallet.updateMany({
      where: {
        email,
        balance: current.balance,
        oopsAt: current.oopsAt
      },
      data: {
        nickname,
        balance: ARCADE_OOPS_TOPUP,
        oopsAt: null
      }
    });
    if (claimed.count !== 1) return tx.arcadeWallet.findUniqueOrThrow({ where: { email } });

    const delta = ARCADE_OOPS_TOPUP - currentBalance;
    const reels = ['oops', String(ARCADE_OOPS_TOPUP), `source:${sourceGame}`];
    await tx.gameScore.create({
      data: {
        email,
        nickname,
        game: sourceGame,
        bet: 0,
        payout: delta,
        delta,
        balance: ARCADE_OOPS_TOPUP,
        reels
      }
    });
    await tx.arcadeLedger.create({
      data: {
        walletId: current.id,
        email,
        nickname,
        game: sourceGame,
        kind: 'oops-topup',
        payout: delta,
        delta,
        balance: ARCADE_OOPS_TOPUP,
        meta: { reels }
      }
    });
    await recordArcadeLeaderChange(tx, sourceGame);
    return tx.arcadeWallet.findUniqueOrThrow({ where: { email } });
  });

  balance = safeNumber(result.balance);
  return { balance, oopsInfo: balance >= ARCADE_MIN_PLAY_BALANCE ? null : { remainingMs: 0 } };
}

/** @param {number} [limit] */
export async function getArcadeRank(limit = 10) {
  const rows = await getPrisma().arcadeWallet.findMany({
    where: { balance: { gt: 0 } },
    orderBy: [{ balance: 'desc' }, { createdAt: 'asc' }],
    take: limit,
    include: {
      ledgers: {
        where: { game: { in: ARCADE_GAMES } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { game: true, createdAt: true }
      }
    }
  });
  return attachGameProfilePhotos(
    rows.map((row) => {
      const latestActivity = row.ledgers[0];
      return {
        email: row.email,
        _id: row.email,
        nickname: row.nickname,
        balance: safeNumber(row.balance),
        lastGame: latestActivity?.game ?? null,
        updatedAt: normalizeToIsoString(latestActivity?.createdAt ?? row.updatedAt)
      };
    })
  );
}

export async function getArcadeLeader() {
  const rows = await getArcadeRank(1);
  return rows[0] ?? null;
}

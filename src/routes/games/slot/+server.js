import { error, json } from '@sveltejs/kit';
import { getGameSession, isLocalGameSmokeSession } from '$lib/server/localGameSmokeSession.js';
import { getTodaySlotStats } from '$lib/server/slotStats.js';
import {
  applyArcadeEntry,
  ArcadePlayConflictError,
  beginArcadePlay,
  ensureArcadeWallet,
  getArcadeRank,
  releaseArcadePlay,
  resolveArcadeOops
} from '$lib/server/arcadeWallet.js';
import { normalizeToIsoString } from '$lib/util/formatRelativeTime.js';

const BASE_SYMBOLS = ['🍒', '🍋', '🔔', '⭐', '7️⃣'];
const MEDIUM_BALANCE_THRESHOLD = 100_000;
const HIGH_BALANCE_THRESHOLD = 300_000;
const SMOKE_SLOT_BALANCE = 1000;

/** @param {number} [balance] */
function spinReels(balance = 0) {
  let symbols = [...BASE_SYMBOLS];
  if (balance >= HIGH_BALANCE_THRESHOLD) {
    symbols = [...symbols, '💎', '🍀'];
  } else if (balance >= MEDIUM_BALANCE_THRESHOLD) {
    symbols = [...symbols, '🍀'];
  }
  return [0, 0, 0].map(() => symbols[Math.floor(Math.random() * symbols.length)]);
}

/** @param {string[]} reels @param {number} bet */
function calcPayout(reels, bet) {
  const [a, b, c] = reels;
  if (a === b && b === c) return bet * (a === '7️⃣' ? 20 : 10);
  if (a === b || b === c || a === c) return bet * 2;
  return 0;
}

/** @param {unknown} user */
function getNickname(user) {
  return typeof user === 'object' &&
    user !== null &&
    'nickname' in user &&
    typeof user.nickname === 'string'
    ? user.nickname
    : 'anonymous';
}

export async function POST(event) {
  const session = await getGameSession(event);
  if (!session?.user?.email) throw error(401, { message: '로그인이 필요합니다.' });

  const body = await event.request.json().catch(() => ({}));
  const bet = Number(body?.bet ?? 0);
  if (!Number.isSafeInteger(bet) || bet <= 0) {
    throw error(400, { message: '잘못된 베팅 금액입니다.' });
  }

  if (isLocalGameSmokeSession(session)) {
    const reels = spinReels(SMOKE_SLOT_BALANCE);
    const payout = calcPayout(reels, bet);
    return json({
      success: true,
      reels,
      payout,
      delta: payout - bet,
      balance: SMOKE_SLOT_BALANCE - bet + payout,
      smoke: true
    });
  }

  const email = session.user.email;
  const nickname = getNickname(session.user);
  let wallet = await ensureArcadeWallet(email, nickname);
  let balanceBefore = Number(wallet.balance);

  if (balanceBefore < 10) {
    const resolved = await resolveArcadeOops(email, nickname, 'slot');
    balanceBefore = resolved.balance;
  }
  if (balanceBefore < bet) {
    throw error(400, {
      message: balanceBefore < 10 ? '오링 😵' : '보유 메달이 부족합니다.'
    });
  }

  let play;
  try {
    play = await beginArcadePlay(email, nickname, 'slot', bet);
    balanceBefore = play.balance;
  } catch (cause) {
    if (cause instanceof ArcadePlayConflictError) {
      throw error(409, { message: cause.message });
    }
    throw error(400, {
      message: cause instanceof Error ? cause.message : '게임을 시작할 수 없습니다.'
    });
  }

  const reels = spinReels(balanceBefore);
  const payout = calcPayout(reels, bet);
  const delta = payout - bet;

  try {
    const settlement = await applyArcadeEntry(email, nickname, {
      game: 'slot',
      kind: 'spin',
      bet,
      payout,
      delta,
      playId: play.playId,
      reels
    });
    const extraMsg = settlement.balance < 10 ? '오링! 😵' : undefined;
    return json({
      success: true,
      reels,
      payout,
      delta,
      balance: settlement.balance,
      id: settlement.score.id,
      message: extraMsg
    });
  } catch (cause) {
    await releaseArcadePlay(email, play.playId);
    if (
      cause instanceof ArcadePlayConflictError ||
      (cause instanceof Error && cause.message === '보유 메달이 부족합니다.')
    ) {
      throw error(409, { message: cause.message });
    }
    throw cause;
  }
}

export async function GET(event) {
  const session = await getGameSession(event);
  if (!session?.user?.email) throw error(401, { message: '로그인이 필요합니다.' });

  const todayStats = await getTodaySlotStats();
  if (isLocalGameSmokeSession(session)) {
    return json({
      balance: SMOKE_SLOT_BALANCE,
      balanceUpdatedAt: null,
      oopsInfo: null,
      todayStats,
      ...(event.url.searchParams.get('rank') ? { rank: [] } : {})
    });
  }

  const email = session.user.email;
  const nickname = getNickname(session.user);
  const resolved = await resolveArcadeOops(email, nickname, 'slot');
  const wallet = await ensureArcadeWallet(email, nickname);
  const payload = {
    balance: resolved.balance,
    balanceUpdatedAt: normalizeToIsoString(wallet.updatedAt),
    oopsInfo: resolved.oopsInfo,
    todayStats
  };

  if (event.url.searchParams.get('rank')) {
    return json(
      { ...payload, rank: await getArcadeRank(10) },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
  return json(payload);
}

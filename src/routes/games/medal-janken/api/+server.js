import { error, json } from '@sveltejs/kit';
import { checkRateLimit } from '$lib/server/apiRateLimit.js';
import { getGameSession, isLocalGameSmokeSession } from '$lib/server/localGameSmokeSession.js';
import {
  ArcadePlayConflictError,
  beginArcadePlay,
  getArcadePlay,
  releaseArcadePlay
} from '$lib/server/arcadeWallet.js';
import { randomInt } from 'node:crypto';
import {
  ensureMedalJankenBalance,
  getMedalJankenRank,
  getTodayMedalJankenStats,
  INITIAL_MEDALS,
  writeMedalJankenScore
} from '../medalJankenBalance.js';

const HANDS = new Set(['rock', 'scissors', 'paper']);
const MULTIPLIERS = new Set([0, 1, 2, 4, 7, 10, 20]);
const MIN_BET = 10;
const MAX_BET = 10_000;
const HAND_LIST = [...HANDS];
const MULTIPLIER_LIST = [...MULTIPLIERS];
/** @type {Record<string, string>} */
const WIN_MAP = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
const smokeBalances = new Map();
const settlingUsers = new Set();

/** @param {string} player @param {string} cpu */
function outcomeFor(player, cpu) {
  if (player === cpu) return 'draw';
  return WIN_MAP[player] === cpu ? 'win' : 'lose';
}

/** @param {import('@sveltejs/kit').RequestEvent} event */
async function requireUser(event) {
  const session = await getGameSession(event);
  const email = session?.user?.email;
  if (!email) throw error(401, { message: '로그인이 필요합니다.' });
  return {
    email,
    nickname: session?.user?.nickname || session?.user?.name || 'anonymous',
    smoke: isLocalGameSmokeSession(session)
  };
}

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function GET(event) {
  const user = await requireUser(event);
  if (user.smoke) {
    return json({
      balance: smokeBalances.get(user.email) ?? INITIAL_MEDALS,
      rank: [],
      todayStats: { hands: 0, users: 0 },
      smoke: true
    });
  }
  const [balance, rank, todayStats] = await Promise.all([
    ensureMedalJankenBalance(user.email, user.nickname),
    getMedalJankenRank(10),
    getTodayMedalJankenStats()
  ]);
  return json({ balance, rank, todayStats });
}

export async function PUT(event) {
  const rate = await checkRateLimit(event, {
    limit: 6,
    windowSeconds: 10,
    bucket: 'medal-janken-start'
  });
  if (!rate.allowed) throw error(429, { message: '너무 빠릅니다. 잠시 쉬었다가 해 주세요.' });
  const user = await requireUser(event);
  const body = await event.request.json().catch(() => ({}));
  const bet = Number(body?.bet);
  const playerChoice = String(body?.playerChoice ?? '');
  if (!Number.isSafeInteger(bet) || bet < MIN_BET || bet > MAX_BET) {
    throw error(400, { message: '베팅은 10개부터 10,000개까지만 가능합니다.' });
  }
  if (!HANDS.has(playerChoice)) throw error(400, { message: '잘못된 손 선택입니다.' });
  const cpuChoice = HAND_LIST[randomInt(HAND_LIST.length)];
  const requestedMultiplier = MULTIPLIER_LIST[randomInt(MULTIPLIER_LIST.length)];
  const outcome = outcomeFor(playerChoice, cpuChoice);
  const multiplier = outcome === 'win' ? requestedMultiplier : 0;
  if (user.smoke) {
    const currentBalance = smokeBalances.get(user.email) ?? INITIAL_MEDALS;
    if (bet > currentBalance) throw error(400, { message: '보유 메달이 부족합니다.' });
    const payout = outcome === 'draw' ? bet : outcome === 'win' ? bet * multiplier : 0;
    const delta = payout - bet;
    const balance = currentBalance + delta;
    smokeBalances.set(user.email, balance);
    return json({
      success: true,
      playId: 'smoke',
      balance,
      cpuChoice,
      multiplier,
      outcome,
      payout,
      delta,
      rank: [],
      todayStats: { hands: 1, users: 1 }
    });
  }
  let playId = '';
  try {
    const play = await beginArcadePlay(user.email, user.nickname, 'medal-janken', bet, 30_000, {
      bet,
      playerChoice,
      cpuChoice,
      multiplier
    });
    playId = play.playId;
    const payout = outcome === 'draw' ? bet : outcome === 'win' ? bet * multiplier : 0;
    const delta = payout - bet;
    const settlement = await writeMedalJankenScore(
      user.email,
      user.nickname,
      play.balance + delta,
      {
        bet,
        payout,
        delta,
        playId,
        reels: [outcome, `player:${playerChoice}`, `cpu:${cpuChoice}`, `multiplier:${multiplier}`]
      }
    );
    const [rank, todayStats] = await Promise.all([
      getMedalJankenRank(10),
      getTodayMedalJankenStats()
    ]);
    return json({
      success: true,
      playId,
      balance: settlement.balance,
      cpuChoice,
      multiplier,
      outcome,
      payout,
      delta,
      rank,
      todayStats
    });
  } catch (cause) {
    if (playId) await releaseArcadePlay(user.email, playId);
    if (cause instanceof ArcadePlayConflictError) {
      throw error(409, { message: cause.message });
    }
    throw error(400, {
      message: cause instanceof Error ? cause.message : '게임을 시작할 수 없습니다.'
    });
  }
}

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function POST(event) {
  const rate = await checkRateLimit(event, {
    limit: 12,
    windowSeconds: 10,
    bucket: 'medal-janken-post'
  });
  if (!rate.allowed) throw error(429, { message: '너무 빠릅니다. 잠시 후 다시 해 주세요.' });

  const user = await requireUser(event);
  if (settlingUsers.has(user.email)) throw error(409, { message: '이전 판을 정산 중입니다.' });
  settlingUsers.add(user.email);
  let playId = '';

  try {
    const body = await event.request.json().catch(() => ({}));
    const bet = Number(body?.bet);
    const playerChoice = String(body?.playerChoice ?? '');

    if (!Number.isSafeInteger(bet) || bet < MIN_BET || bet > MAX_BET) {
      throw error(400, { message: '베팅은 10개부터 10,000개까지만 가능합니다.' });
    }
    if (!HANDS.has(playerChoice)) {
      throw error(400, { message: '잘못된 손 선택입니다.' });
    }

    let currentBalance = user.smoke
      ? (smokeBalances.get(user.email) ?? INITIAL_MEDALS)
      : await ensureMedalJankenBalance(user.email, user.nickname);
    if (bet > currentBalance) throw error(400, { message: '보유 메달이 부족합니다.' });
    let cpuChoice = String(body?.cpuChoice ?? '');
    let requestedMultiplier = Number(body?.multiplier ?? 0);
    if (!user.smoke) {
      const reservedPlayId = String(body?.playId ?? '');
      if (!reservedPlayId) {
        throw new ArcadePlayConflictError('게임 시작 토큰이 없습니다.');
      }
      playId = reservedPlayId;
      const play = await getArcadePlay(user.email, playId);
      if (play.game !== 'medal-janken') {
        throw new ArcadePlayConflictError('다른 게임의 시작 토큰입니다.');
      }
      const payload =
        play.payload && typeof play.payload === 'object'
          ? /** @type {Record<string, unknown>} */ (play.payload)
          : {};
      if (Number(payload.bet) !== bet || String(payload.playerChoice) !== playerChoice) {
        throw new ArcadePlayConflictError('게임 시작 정보가 일치하지 않습니다.');
      }
      cpuChoice = String(payload.cpuChoice ?? '');
      requestedMultiplier = Number(payload.multiplier ?? 0);
      currentBalance = play.balance;
    }
    if (!HANDS.has(cpuChoice) || !MULTIPLIERS.has(requestedMultiplier)) {
      throw new ArcadePlayConflictError('서버 게임 결과가 올바르지 않습니다.');
    }

    const outcome = outcomeFor(playerChoice, cpuChoice);
    const multiplier =
      outcome === 'win' && MULTIPLIERS.has(requestedMultiplier) ? requestedMultiplier : 0;
    if (outcome === 'win' && !MULTIPLIERS.has(requestedMultiplier)) {
      throw error(400, { message: '잘못된 룰렛 결과입니다.' });
    }

    const payout = outcome === 'draw' ? bet : outcome === 'win' ? bet * multiplier : 0;
    const delta = payout - bet;
    let balance = currentBalance + delta;

    if (user.smoke) {
      smokeBalances.set(user.email, balance);
    } else {
      const settlement = await writeMedalJankenScore(user.email, user.nickname, balance, {
        bet,
        payout,
        delta,
        playId,
        reels: [outcome, `player:${playerChoice}`, `cpu:${cpuChoice}`, `multiplier:${multiplier}`]
      });
      balance = settlement.balance;
    }

    const [rank, todayStats] = user.smoke
      ? [[], { hands: 1, users: 1 }]
      : await Promise.all([getMedalJankenRank(10), getTodayMedalJankenStats()]);
    return json({
      success: true,
      balance,
      outcome,
      multiplier,
      payout,
      delta,
      rank,
      todayStats,
      smoke: user.smoke
    });
  } catch (cause) {
    if (cause instanceof ArcadePlayConflictError) {
      throw error(409, { message: cause.message });
    }
    if (cause instanceof Error && cause.message === '보유 메달이 부족합니다.') {
      throw error(400, { message: cause.message });
    }
    throw cause;
  } finally {
    if (playId) await releaseArcadePlay(user.email, playId);
    settlingUsers.delete(user.email);
  }
}

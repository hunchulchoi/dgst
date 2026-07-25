import { error, json } from '@sveltejs/kit';
import { checkRateLimit } from '$lib/server/apiRateLimit.js';
import { getGameSession, isLocalGameSmokeSession } from '$lib/server/localGameSmokeSession.js';
import {
  ensureMedalJankenBalance,
  getMedalJankenRank,
  getTodayMedalJankenStats,
  INITIAL_MEDALS,
  writeMedalJankenScore
} from '../medalJankenBalance.js';

const HANDS = new Set(['rock', 'scissors', 'paper']);
const MULTIPLIERS = new Set([0, 1, 2, 4, 7, 10, 20]);
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

  try {
    const body = await event.request.json().catch(() => ({}));
    const bet = Number(body?.bet);
    const playerChoice = String(body?.playerChoice ?? '');
    const cpuChoice = String(body?.cpuChoice ?? '');
    const requestedMultiplier = Number(body?.multiplier ?? 0);

    if (!Number.isSafeInteger(bet) || bet < 10) {
      throw error(400, { message: '베팅은 10개 이상만 가능합니다.' });
    }
    if (!HANDS.has(playerChoice) || !HANDS.has(cpuChoice)) {
      throw error(400, { message: '잘못된 손 선택입니다.' });
    }

    const currentBalance = user.smoke
      ? (smokeBalances.get(user.email) ?? INITIAL_MEDALS)
      : await ensureMedalJankenBalance(user.email, user.nickname);
    if (bet > currentBalance) throw error(400, { message: '보유 메달이 부족합니다.' });

    const outcome = outcomeFor(playerChoice, cpuChoice);
    const multiplier =
      outcome === 'win' && MULTIPLIERS.has(requestedMultiplier) ? requestedMultiplier : 0;
    if (outcome === 'win' && !MULTIPLIERS.has(requestedMultiplier)) {
      throw error(400, { message: '잘못된 룰렛 결과입니다.' });
    }

    const payout = outcome === 'draw' ? bet : outcome === 'win' ? bet * multiplier : 0;
    const delta = payout - bet;
    const balance = currentBalance + delta;

    if (user.smoke) {
      smokeBalances.set(user.email, balance);
    } else {
      await writeMedalJankenScore(user.email, user.nickname, balance, {
        bet,
        payout,
        delta,
        reels: [outcome, `player:${playerChoice}`, `cpu:${cpuChoice}`, `multiplier:${multiplier}`]
      });
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
  } finally {
    settlingUsers.delete(user.email);
  }
}

import connectDB from '$lib/database/mongoosePriomise.js';
import { error, json } from '@sveltejs/kit';
import { GameScore } from '$lib/models/gameScore.js';

connectDB();

function spinReels() {
  const symbols = ['🍒', '🍋', '🔔', '⭐', '7️⃣'];
  return [0, 0, 0].map(() => symbols[Math.floor(Math.random() * symbols.length)]);
}

function calcPayout(reels, bet) {
  const [a, b, c] = reels;
  if (a === b && b === c) {
    // triple
    return bet * 10;
  }
  if (a === b || b === c || a === c) {
    // pair
    return bet * 2;
  }
  return 0;
}

async function getBalance(email) {
  const last = await GameScore.findOne({ email }).sort({ createdAt: -1 }).select({ balance: 1 }).lean();
  return last?.balance ?? 0;
}

// 잔액 0 상태가 10분 이상이면 700점 보충 (지연 지급)
async function maybeTopupAfterOOPS(email, nickname) {
  const last = await GameScore.findOne({ email }).sort({ createdAt: -1 }).lean();
  if (!last) return 0;
  if ((last.balance ?? 0) > 0) return last.balance;
  const createdAt = new Date(last.createdAt).getTime();
  const now = Date.now();
  const TEN_MIN = 10 * 60 * 1000;
  if (now - createdAt >= TEN_MIN) {
    const doc = await GameScore.create({
      email,
      nickname,
      game: 'slot',
      bet: 0,
      payout: 700,
      delta: 700,
      balance: 700,
      reels: ['-', '-', '-']
    });
    return doc.balance;
  }
  return 0;
}

export async function POST({ request, locals }) {
  const session = await locals.auth();
  if (!session?.user?.email) throw error(401, { message: '로그인이 필요합니다.' });

  const body = await request.json().catch(() => ({}));
  const bet = Number(body?.bet ?? 0);
  if (!Number.isFinite(bet) || bet <= 0 || bet > 1000000) {
    throw error(400, { message: '잘못된 베팅 금액입니다.' });
  }

  const email = session.user.email;
  const nickname = session.user.nickname || 'anonymous';
  const last = await GameScore.findOne({ email }).sort({ createdAt: -1 }).lean();
  let balanceBefore = last?.balance ?? 0;
  // 최초 이용자(기록이 전무): 1000점 지급 후 안내
  if (!last) {
    await GameScore.create({
      email,
      nickname,
      game: 'slot',
      bet: 0,
      payout: 0,
      delta: 0,
      balance: 1000,
      reels: ['-', '-', '-']
    });
    return json({ success: false, balance: 1000, message: '첫 1000점 지급! 다시 베팅해 주세요.' });
  }
  // 기록은 있지만 잔액 0인 경우: 10분 경과 시 100점 보충, 미경과 시 안내
  if (balanceBefore === 0) {
    const topped = await maybeTopupAfterOOPS(email, nickname);
    balanceBefore = topped > 0 ? topped : 0;
    if (balanceBefore === 0) {
      throw error(400, { message: '오링 상태입니다. 10분 뒤에 700점이 자동 지급됩니다.' });
    }
  }
  if (balanceBefore < bet) throw error(400, { message: '보유 점수가 부족합니다.' });

  const reels = spinReels();
  const payout = calcPayout(reels, bet);
  const delta = payout - bet;
  const balanceAfter = balanceBefore + delta;

  // 스핀 결과 기록
  const docSpin = await GameScore.create({
    email,
    nickname,
    game: 'slot',
    bet,
    payout,
    delta,
    balance: balanceAfter,
    reels,
  });
  const extraMsg = balanceAfter === 0 ? '오링! 10분 뒤에 700점이 자동 지급됩니다.' : undefined;
  return json({ success: true, reels, payout, delta, balance: balanceAfter, id: docSpin._id, message: extraMsg });
}

export async function GET({ locals, url }) {
  const session = await locals.auth();
  if (!session?.user?.email) throw error(401, { message: '로그인이 필요합니다.' });
  const email = session.user.email;
  const nickname = session.user.nickname || 'anonymous';
  const last = await GameScore.findOne({ email }).sort({ createdAt: -1 }).lean();
  let balance = last?.balance ?? 0;
  // 최초 이용자만 1000점 지급 (기록이 전무한 경우에만)
  if (!last) {
    await GameScore.create({
      email,
      nickname,
      game: 'slot',
      bet: 0, payout: 0, delta: 0, balance: 1000, reels: ['-', '-', '-']
    });
    balance = 1000;
  }
  let oopsInfo = null;
  // 잔액 0이 10분 이상 지속되면 700점 보충
  if (balance === 0 && last) {
    const topped = await maybeTopupAfterOOPS(email, nickname);
    if (topped > 0) {
      balance = topped;
    } else {
      // 오링 상태: 남은 시간 정보 반환
      const createdAt = new Date(last.createdAt).getTime();
      const now = Date.now();
      const TEN_MIN = 10 * 60 * 1000;
      const elapsed = now - createdAt;
      const remaining = TEN_MIN - elapsed;
      if (remaining > 0) {
        oopsInfo = {
          createdAt: last.createdAt,
          remainingMs: remaining
        };
      }
    }
  }
  if (url.searchParams.get('rank')) {
    // 랭킹 처리: 각 user의 가장 최근 balance, 상위 10명
    const balances = await GameScore.aggregate([
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$email', nickname: { $first: '$nickname' }, balance: { $first: '$balance' } } },
      { $sort: { balance: -1 } },
      { $limit: 7 }
    ]);
    return json({ balance, rank: balances, oopsInfo });
  }
  return json({ balance, oopsInfo });
}



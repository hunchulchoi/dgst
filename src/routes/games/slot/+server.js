import connectDB from '$lib/database/mongoosePriomise.js';
import { error, json } from '@sveltejs/kit';
import { GameScore } from '$lib/models/gameScore.js';
import { getTodaySlotStats } from '$lib/server/slotStats.js';

/**
 * @typedef {import('mongoose').Types.ObjectId} ObjectId
 */

/**
 * @typedef {Object} LeanGameScore
 * @property {ObjectId} _id
 * @property {string} email
 * @property {string} nickname
 * @property {string} game
 * @property {number} bet
 * @property {number} payout
 * @property {number} delta
 * @property {number} balance
 * @property {string[]} reels
 * @property {Date} createdAt
 * @property {Date} updatedAt
 */

connectDB();

const OOPS_TOPUP_DELAY_MS = 5 * 60 * 1000;

/**
 * @returns {string[]}
 */
function spinReels() {
  const symbols = ['🍒', '🍋', '🔔', '⭐', '7️⃣'];
  return [0, 0, 0].map(() => symbols[Math.floor(Math.random() * symbols.length)]);
}

/**
 * @param {string[]} reels
 * @param {number} bet
 * @returns {number}
 */
function calcPayout(reels, bet) {
  const [a, b, c] = reels;
  if (a === b && b === c) {
    // triple
    // 7️⃣7️⃣7️⃣은 ×20, 나머지는 ×10
    if (a === '7️⃣' && b === '7️⃣' && c === '7️⃣') {
      return bet * 20;
    }
    return bet * 10;
  }
  if (a === b || b === c || a === c) {
    // pair
    return bet * 2;
  }
  return 0;
}

/**
 * @param {string} email
 * @returns {Promise<number>}
 */
async function getBalance(email) {
  const last = /** @type {(LeanGameScore | null)} */ (
    await GameScore.findOne({ email }).sort({ createdAt: -1 }).select({ balance: 1 }).lean()
  );
  return last?.balance ?? 0;
}

// 잔액 0 상태가 5분 이상이면 700점 보충 (지연 지급)
// 실제 스핀(bet>0)에서 오링(balance=0)이 발생한 경우만 체크
// 댓글 보상으로 받은 점수가 있으면 오링이 아님
/**
 * @param {string} email
 * @param {string} nickname
 * @returns {Promise<number>}
 */
async function maybeTopupAfterOOPS(email, nickname) {
  // 실제 스핀 기록(bet > 0) 중에서 balance가 0인 마지막 기록 찾기
  const lastOopsSpin = /** @type {(LeanGameScore | null)} */ (await GameScore.findOne({
    email,
    bet: { $gt: 0 }, // 실제 스핀만 (댓글 보상 제외)
    balance: 0
  }).sort({ createdAt: -1 }).lean());

  if (!lastOopsSpin) {
    return 0; // 실제 스핀에서 오링이 발생하지 않았으면 0 반환
  }

  // 댓글 보상으로 받은 점수가 있는지 확인 (오링 이후에 댓글 보상이 있으면 오링이 아님)
  const lastRewardAfterOops = /** @type {(LeanGameScore | null)} */ (await GameScore.findOne({
    email,
    bet: 0,
    payout: 100,
    delta: 100,
    createdAt: { $gt: lastOopsSpin.createdAt }
  }).sort({ createdAt: -1 }).lean());

  // 오링 이후에 댓글 보상을 받았으면 오링이 아님 (balance > 0이 되었을 것)
  if (lastRewardAfterOops) {
    // 댓글 보상 이후의 최종 balance 확인
    const lastAfterReward = /** @type {(LeanGameScore | null)} */ (
      await GameScore.findOne({ email }).sort({ createdAt: -1 }).lean()
    );
    if (lastAfterReward && (lastAfterReward.balance ?? 0) > 0) {
      return lastAfterReward.balance; // 댓글 보상으로 balance가 올라갔으면 오링이 아님
    }
  }

  // 오링 시점 기준으로 5분 경과 확인
  const createdAt = new Date(lastOopsSpin.createdAt).getTime();
  const now = Date.now();
  if (now - createdAt >= OOPS_TOPUP_DELAY_MS) {
    const doc = /** @type {LeanGameScore} */ (
      await GameScore.create({
        email,
        nickname,
        game: 'slot',
        bet: 0,
        payout: 700,
        delta: 700,
        balance: 700,
        reels: ['-', '-', '-']
      })
    );
    return doc.balance;
  }
  return 0;
}

export async function POST({ request, locals }) {
  const session = await locals.auth();
  if (!session?.user?.email) throw error(401, { message: '로그인이 필요합니다.' });

  const body = await request.json().catch(() => ({}));
  const bet = Number(body?.bet ?? 0);
  if (!Number.isFinite(bet) || bet <= 0) {
    throw error(400, { message: '잘못된 베팅 금액입니다.' });
  }

  const email = session.user.email;
  const nickname = typeof session.user === 'object' && 'nickname' in session.user && typeof session.user.nickname === 'string'
    ? session.user.nickname
    : 'anonymous';
  const last = /** @type {(LeanGameScore | null)} */ (
    await GameScore.findOne({ email }).sort({ createdAt: -1 }).lean()
  );
  let balanceBefore = last?.balance ?? 0;

  if (bet > balanceBefore) {
    throw error(400, { message: '보유 점수가 부족합니다.' });
  }
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
  // 기록은 있지만 잔액 0인 경우: 5분 경과 시 100점 보충, 미경과 시 안내
  if (balanceBefore === 0) {
    const topped = await maybeTopupAfterOOPS(email, nickname);
    balanceBefore = topped > 0 ? topped : 0;
    if (balanceBefore === 0) {
      throw error(400, { message: '오링 😵' });
    }
  }
  if (balanceBefore < bet) throw error(400, { message: '보유 점수가 부족합니다.' });

  const reels = spinReels();
  const payout = calcPayout(reels, bet);
  const delta = payout - bet;
  const balanceAfter = balanceBefore + delta;

  // 스핀 결과 기록
  const docSpin = /** @type {LeanGameScore} */ (
    await GameScore.create({
      email,
      nickname,
      game: 'slot',
      bet,
      payout,
      delta,
      balance: balanceAfter,
      reels,
    })
  );
  const extraMsg = balanceAfter === 0 ? '오링! 😵' : undefined;
  return json({ success: true, reels, payout, delta, balance: balanceAfter, id: docSpin._id, message: extraMsg });
}

export async function GET({ locals, url }) {
  const session = await locals.auth();
  if (!session?.user?.email) throw error(401, { message: '로그인이 필요합니다.' });
  const email = session.user.email;
  const nickname = typeof session.user === 'object' && 'nickname' in session.user && typeof session.user.nickname === 'string'
    ? session.user.nickname
    : 'anonymous';
  const last = /** @type {(LeanGameScore | null)} */ (
    await GameScore.findOne({ email }).sort({ createdAt: -1 }).lean()
  );
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
  // 잔액 0인 경우 체크
  if (balance === 0 && last) {
    // 실제 스핀에서 오링이 발생한 경우인지 확인
    const lastOopsSpin = /** @type {(LeanGameScore | null)} */ (await GameScore.findOne({
      email,
      bet: { $gt: 0 }, // 실제 스핀만
      balance: 0
    }).sort({ createdAt: -1 }).lean());

    if (lastOopsSpin) {
      // 오링 이후에 댓글 보상으로 받은 점수가 있는지 확인
      const lastRewardAfterOops = /** @type {(LeanGameScore | null)} */ (await GameScore.findOne({
        email,
        bet: 0,
        payout: 100,
        delta: 100,
        createdAt: { $gt: lastOopsSpin.createdAt }
      }).sort({ createdAt: -1 }).lean());

      // 댓글 보상으로 받은 점수가 있으면 오링이 아님 (balance > 0이 되어 있을 것)
      // 댓글 보상이 없거나, 받았지만 다시 0이 된 경우(10개 보상 다 받고 다시 스핀해서 0이 된 경우)에만 오링 처리
      const shouldCountAsOops = !lastRewardAfterOops ||
        (/** @type {(LeanGameScore | null)} */ (await GameScore.findOne({ email }).sort({ createdAt: -1 }).lean()))?.balance === 0;

      if (shouldCountAsOops) {
        const topped = await maybeTopupAfterOOPS(email, nickname);
        if (topped > 0) {
          balance = topped;
        } else {
          // 오링 상태: 남은 시간 정보 반환 (실제 스핀 기준)
          const createdAt = new Date(lastOopsSpin.createdAt).getTime();
          const now = Date.now();
          const elapsed = now - createdAt;
          const remaining = OOPS_TOPUP_DELAY_MS - elapsed;
          if (remaining > 0) {
            oopsInfo = {
              createdAt: lastOopsSpin.createdAt,
              remainingMs: remaining
            };
          }
        }
      }
      // 댓글 보상으로 받은 점수가 있고 balance > 0이면 오링이 아니므로 oopsInfo는 null로 유지
    }
  }
  const todayStats = await getTodaySlotStats();

  if (url.searchParams.get('rank')) {
    // 랭킹 처리: 각 user의 가장 최근 balance, 상위 10명
    const balances = await GameScore.aggregate([
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$email',
          nickname: { $first: '$nickname' },
          balance: { $first: '$balance' },
          totalSpin: { $sum: { $cond: [{ $gt: ['$bet', 0] }, 1, 0] } }
        }
      },
      { $match: { totalSpin: { $gt: 0 } } },
      { $sort: { balance: -1 } },
      { $limit: 10 }
    ]);
    return json({ balance, rank: balances, oopsInfo, todayStats });
  }
  return json({ balance, oopsInfo, todayStats });
}



import { SlotUserBalance } from '$lib/models/slotUserBalance.js';
import { GameScore } from '$lib/models/gameScore.js';

let backfillPromise = null;

/**
 * game_scores 집계 결과로 slot_user_balance를 채움. 컬렉션이 비었을 때 1회만 자동 호출됨.
 * @returns {Promise<number>} upsert된 행 수
 */
export async function backfillSlotUserBalance() {
  if (backfillPromise) return backfillPromise;
  backfillPromise = (async () => {
    try {
      const cursor = GameScore.aggregate([
        { $sort: { email: 1, createdAt: -1 } },
        {
          $group: {
            _id: '$email',
            nickname: { $first: '$nickname' },
            balance: { $first: '$balance' },
            totalSpin: { $sum: { $cond: [{ $gt: ['$bet', 0] }, 1, 0] } }
          }
        },
        { $match: { totalSpin: { $gt: 0 } } }
      ]).cursor();

      const bulk = [];
      const BATCH = 500;
      let count = 0;

      for await (const doc of cursor) {
        bulk.push({
          updateOne: {
            filter: { email: doc._id },
            update: {
              $set: {
                nickname: doc.nickname,
                balance: doc.balance,
                totalSpin: doc.totalSpin,
                updatedAt: new Date()
              },
              $setOnInsert: { createdAt: new Date() }
            },
            upsert: true
          }
        });
        if (bulk.length >= BATCH) {
          await SlotUserBalance.bulkWrite(bulk);
          count += bulk.length;
          bulk.length = 0;
        }
      }
      if (bulk.length) {
        await SlotUserBalance.bulkWrite(bulk);
        count += bulk.length;
      }
      return count;
    } finally {
      backfillPromise = null;
    }
  })();
  return backfillPromise;
}

/**
 * 랭킹 조회 전에 slot_user_balance가 비어 있으면 1회만 백필 후 진행.
 */
export async function ensureSlotUserBalanceFilled() {
  const n = await SlotUserBalance.countDocuments();
  if (n === 0) {
    const count = await backfillSlotUserBalance();
    if (count > 0) console.log('[slot_user_balance] 자동 백필 완료:', count, '명');
  }
}

/**
 * GameScore 생성 시 호출: slot_user_balance에 해당 유저의 최신 balance/totalSpin 반영.
 * 랭킹/잔액 조회는 이 컬렉션만 사용해 30만 건 집계를 피함.
 *
 * @param {string} email
 * @param {string} nickname
 * @param {number} balance - 반영할 최신 잔액
 * @param {{ incSpin?: boolean }} [opts] - incSpin: true면 totalSpin +1 (실제 스핀일 때만)
 */
export async function updateSlotUserBalance(email, nickname, balance, opts = {}) {
  try {
    await SlotUserBalance.findOneAndUpdate(
      { email },
      {
        $set: { nickname, balance, updatedAt: new Date() },
        ...(opts.incSpin === true ? { $inc: { totalSpin: 1 } } : {}),
        $setOnInsert: { totalSpin: opts.incSpin ? 1 : 0 }
      },
      { upsert: true }
    );
  } catch (e) {
    console.error('updateSlotUserBalance failed', email, e?.message);
  }
}

/**
 * 유저의 현재 잔액 조회. slot_user_balance 우선, 없으면 game_scores 마지막 행으로 백필.
 *
 * @param {string} email
 * @returns {Promise<number>}
 */
export async function getSlotBalance(email) {
  const row = await SlotUserBalance.findOne({ email }).select({ balance: 1 }).lean();
  if (row != null) return row.balance;
  const last = await GameScore.findOne({ email }).sort({ createdAt: -1 }).select({ balance: 1, nickname: 1 }).lean();
  const balance = last?.balance ?? 0;
  const nickname = (last && 'nickname' in last && last.nickname) ? last.nickname : 'anonymous';
  await updateSlotUserBalance(email, nickname, balance, {});
  return balance;
}

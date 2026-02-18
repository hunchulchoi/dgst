/**
 * 기존 game_scores 집계 결과로 slot_user_balance 컬렉션을 채웁니다.
 * 랭킹 API를 SlotUserBalance로 전환한 뒤 최초 1회 실행 권장.
 *
 * 사용: MONGODB_URI=... node scripts/backfill-slot-user-balance.js
 * (프로젝트 루트에서 실행)
 */
import mongoose from 'mongoose';
import { GameScore } from '../src/lib/models/gameScore.js';
import { SlotUserBalance } from '../src/lib/models/slotUserBalance.js';

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;
if (!MONGODB_URI) {
  console.error('MONGODB_URI or DATABASE_URL required');
  process.exit(1);
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected. Aggregating game_scores...');

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

  let count = 0;
  const bulk = [];
  const BATCH = 500;

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
      console.log('Upserted', count, 'users');
    }
  }
  if (bulk.length) {
    await SlotUserBalance.bulkWrite(bulk);
    count += bulk.length;
  }

  console.log('Done. Total slot_user_balance rows upserted:', count);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

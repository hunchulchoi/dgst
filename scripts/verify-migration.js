/**
 * MongoDB/Redis → PostgreSQL 마이그레이션 검증.
 * 컬렉션별 row count, orphan comment, Redis alarm count를 비교합니다.
 *
 * 사용:
 *   MONGODB_CONNECTION_STRING="..." DB_NAME="dgstdb" REDIS_URL="..." DATABASE_URL="..." \
 *     node scripts/verify-migration.js
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const REDIS_PREFIX = process.env.REDIS_PREFIX || 'dgst:';
const SCAN_COUNT = 200;

const MONGODB_CONNECTION_STRING = process.env.MONGODB_CONNECTION_STRING;
const DB_NAME = process.env.DB_NAME || 'dgstdb';
const REDIS_URL = process.env.REDIS_URL;
const DATABASE_URL = process.env.DATABASE_URL;

if (!MONGODB_CONNECTION_STRING) {
  console.error('MONGODB_CONNECTION_STRING is required');
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL })
});

/** @param {import('mongodb').Db} db @param {string} name */
async function mongoCount(db, name) {
  try {
    const cols = await db.listCollections({ name }).toArray();
    if (cols.length === 0) return 0;
    return db.collection(name).countDocuments();
  } catch {
    return 0;
  }
}

/** @param {import('mongodb').Db} db */
async function validMongoCommentCount(db) {
  const articleIds = new Set(
    (
      await db
        .collection('articles')
        .find({}, { projection: { _id: 1 } })
        .toArray()
    ).map((doc) => String(doc._id))
  );

  let count = 0;
  const cursor = db.collection('comments').find({}, { projection: { articleId: 1 } });
  for await (const doc of cursor) {
    const articleId = doc.articleId != null ? String(doc.articleId) : null;
    if (articleId && articleIds.has(articleId)) count += 1;
  }
  return count;
}

/** @param {import('ioredis').default} redis */
async function countRedisAlarmKeys(redis) {
  const pattern = `${REDIS_PREFIX}alarms:data:*`;
  let cursor = '0';
  let count = 0;

  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', SCAN_COUNT);
    cursor = next;
    count += keys.length;
  } while (cursor !== '0');

  return count;
}

/**
 * @param {string} label
 * @param {number} mongo
 * @param {number} pg
 * @returns {boolean}
 */
function compareCount(label, mongo, pg) {
  const ok = mongo === pg;
  const status = ok ? 'OK' : 'MISMATCH';
  console.log(`[${label}] mongo=${mongo} postgres=${pg} → ${status}`);
  return ok;
}

async function main() {
  let failed = false;
  const mongo = new MongoClient(MONGODB_CONNECTION_STRING);
  /** @type {import('ioredis').default | null} */
  let redis = null;

  try {
    await mongo.connect();
    const db = mongo.db(DB_NAME);
    console.log('Verifying migration counts...\n');

    const checks = [
      ['users', () => mongoCount(db, 'users'), () => prisma.user.count()],
      ['articles', () => mongoCount(db, 'articles'), () => prisma.article.count()],
      ['comments', () => validMongoCommentCount(db), () => prisma.comment.count()],
      ['sessions', () => mongoCount(db, 'sessions'), () => prisma.session.count()],
      ['game_scores', () => mongoCount(db, 'game_scores'), () => prisma.gameScore.count()],
      [
        'slot_user_balance',
        () => mongoCount(db, 'slot_user_balance'),
        () => prisma.slotUserBalance.count()
      ]
    ];

    for (const [label, mongoFn, pgFn] of checks) {
      const mongoTotal = await mongoFn();
      const pgTotal = await pgFn();
      if (!compareCount(label, mongoTotal, pgTotal)) failed = true;
    }

    if (REDIS_URL) {
      try {
        redis = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
        await redis.connect();
        const redisAlarms = await countRedisAlarmKeys(redis);
        const pgAlarms = await prisma.alarm.count();
        if (!compareCount('alarms', redisAlarms, pgAlarms)) failed = true;
      } catch (err) {
        console.warn(
          `[alarms] skipped — Redis unavailable: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } else {
      console.warn('[alarms] skipped — REDIS_URL not set');
    }

    const orphanRows = await prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM comments c LEFT JOIN articles a ON a.id = c.article_id WHERE a.id IS NULL`;
    const orphanCount = /** @type {{ n: number }[]} */ (orphanRows)[0]?.n ?? 0;
    const orphanOk = orphanCount === 0;
    console.log(`[orphan_comments] count=${orphanCount} → ${orphanOk ? 'OK' : 'MISMATCH'}`);
    if (!orphanOk) failed = true;

    console.log('');
    if (failed) {
      console.error('Verification FAILED — counts or FK integrity mismatch.');
      process.exitCode = 1;
    } else {
      console.log('Verification PASSED.');
    }
  } catch (err) {
    console.error('Verification error:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await mongo.close().catch(() => {});
    if (redis) await redis.quit().catch(() => {});
    await prisma.$disconnect().catch(() => {});
    if (process.exitCode === 1) process.exit(1);
  }
}

main();

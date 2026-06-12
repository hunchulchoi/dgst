/**
 * MongoDB + Redis → PostgreSQL 운영 데이터 일괄 이전.
 *
 * 사용 (프로젝트 루트):
 *   MONGODB_CONNECTION_STRING="..." DB_NAME="dgstdb" REDIS_URL="..." DATABASE_URL="..." \
 *     node scripts/migrate-mongo-to-pg.js
 */
import { randomBytes } from 'node:crypto';
import { MongoClient } from 'mongodb';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

const BATCH = 1000;
const REDIS_PREFIX = process.env.REDIS_PREFIX || 'dgst:';
const SCAN_COUNT = 200;
const ALARM_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

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

const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

/** @returns {string} */
function generateCuid() {
  const ts = Date.now().toString(36);
  const rand = randomBytes(8).toString('base64url').replace(/[-_]/g, 'x').slice(0, 12);
  return `c${ts}${rand}`.slice(0, 25);
}

/** @param {unknown} value @returns {string | null} */
function objectIdToHex(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'toHexString' in value) {
    return /** @type {{ toHexString: () => string }} */ (value).toHexString();
  }
  return String(value);
}

/** @param {unknown} value @returns {Date | null} */
function toDate(value) {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** @param {Record<string, unknown>} doc @returns {Date | null} */
function mapEmailVerified(doc) {
  const verified = doc.emailVerified;
  if (verified === true) return toDate(doc.created_at) ?? new Date();
  if (verified === false || verified == null) return null;
  return toDate(verified);
}

/** @param {import('mongodb').Db} db @param {string} name @returns {Promise<boolean>} */
async function collectionExists(db, name) {
  const cols = await db.listCollections({ name }).toArray();
  return cols.length > 0;
}

/**
 * @template T
 * @param {string} label
 * @param {AsyncIterable<Record<string, unknown>>} cursor
 * @param {(doc: Record<string, unknown>) => T | null | undefined} mapFn
 * @param {(batch: T[]) => Promise<{ count: number }>} insertFn
 */
async function migrateInBatches(label, cursor, mapFn, insertFn) {
  /** @type {T[]} */
  let batch = [];
  let total = 0;

  try {
    for await (const doc of cursor) {
      const row = mapFn(doc);
      if (row == null) continue;
      batch.push(row);
      if (batch.length >= BATCH) {
        const result = await insertFn(batch);
        total += result.count;
        console.log(`[${label}] ${total} rows migrated...`);
        batch = [];
      }
    }
    if (batch.length > 0) {
      const result = await insertFn(batch);
      total += result.count;
    }
    console.log(`[${label}] done: ${total} rows`);
    return total;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[${label}] migration failed: ${msg}`);
  }
}

/** @param {import('mongodb').Db} db */
async function migrateUsers(db) {
  return migrateInBatches(
    'users',
    db.collection('users').find({}),
    (doc) => ({
      id: String(doc.id),
      email: doc.email ?? null,
      emailVerified: mapEmailVerified(doc),
      name: doc.name ?? null,
      image: doc.image ?? null,
      nickname: String(doc.nickname),
      introduction: doc.introduction != null ? String(doc.introduction) : '',
      photo: doc.photo ?? null,
      state: String(doc.state),
      grade: doc.grade != null ? String(doc.grade) : 'user',
      createdAt: toDate(doc.created_at),
      latestLoginAt: toDate(doc.latest_login_at),
      lastModified: toDate(doc.last_modified)
    }),
    (batch) => prisma.user.createMany({ data: batch, skipDuplicates: true })
  );
}

/** @param {import('mongodb').Db} db */
async function migrateAccounts(db) {
  return migrateInBatches(
    'accounts',
    db.collection('accounts').find({}),
    (doc) => {
      if (!doc.userId || !doc.type || !doc.provider || !doc.providerAccountId) return null;
      return {
        id: typeof doc.id === 'string' && doc.id ? doc.id : generateCuid(),
        userId: String(doc.userId),
        type: String(doc.type),
        provider: String(doc.provider),
        providerAccountId: String(doc.providerAccountId)
      };
    },
    (batch) => prisma.account.createMany({ data: batch, skipDuplicates: true })
  );
}

/** @param {import('mongodb').Db} db */
async function migrateSessions(db) {
  return migrateInBatches(
    'sessions',
    db.collection('sessions').find({}),
    (doc) => {
      if (!doc.sessionToken || !doc.userId || !doc.expires) return null;
      const expires = toDate(doc.expires);
      if (!expires) return null;
      return {
        id: typeof doc.id === 'string' && doc.id ? doc.id : generateCuid(),
        sessionToken: String(doc.sessionToken),
        userId: String(doc.userId),
        expires
      };
    },
    (batch) => prisma.session.createMany({ data: batch, skipDuplicates: true })
  );
}

/** @param {import('mongodb').Db} db */
async function migrateArticles(db) {
  return migrateInBatches(
    'articles',
    db.collection('articles').find({}),
    (doc) => {
      const id = objectIdToHex(doc._id);
      if (!id) return null;
      return {
        id,
        email: String(doc.email),
        nickname: String(doc.nickname),
        boardId: String(doc.boardId),
        title: String(doc.title ?? ''),
        content: String(doc.content ?? ''),
        state: doc.state != null ? String(doc.state) : 'write',
        reads: Array.isArray(doc.reads) ? doc.reads.map(String) : [],
        likes: Array.isArray(doc.likes) ? doc.likes.map(String) : [],
        unlikes: Array.isArray(doc.unlikes) ? doc.unlikes.map(String) : [],
        modifiedEmail: doc.modified_email ?? null,
        createdAt: toDate(doc.createdAt) ?? new Date(),
        updatedAt: toDate(doc.updatedAt) ?? toDate(doc.createdAt) ?? new Date()
      };
    },
    (batch) => prisma.article.createMany({ data: batch, skipDuplicates: true })
  );
}

/** @param {import('mongodb').Db} db */
async function migrateComments(db) {
  return migrateInBatches(
    'comments',
    db.collection('comments').find({}),
    (doc) => {
      const id = objectIdToHex(doc._id);
      if (!id || !doc.articleId) return null;
      return {
        id,
        email: String(doc.email),
        nickname: String(doc.nickname),
        photo: doc.photo ?? null,
        boardId: String(doc.boardId),
        articleId: String(doc.articleId),
        parentCommentId: doc.parentCommentId ? String(doc.parentCommentId) : null,
        parentCommentNickname: doc.parentCommentNickname ?? null,
        depth: typeof doc.depth === 'number' ? doc.depth : 1,
        content: doc.content ?? null,
        image: doc.image ?? null,
        state: doc.state != null ? String(doc.state) : 'write',
        likes: Array.isArray(doc.likes) ? doc.likes.map(String) : [],
        unlikes: Array.isArray(doc.unlikes) ? doc.unlikes.map(String) : [],
        modifiedEmail: doc.modified_email ?? null,
        createdAt: toDate(doc.createdAt) ?? new Date(),
        updatedAt: toDate(doc.updatedAt) ?? toDate(doc.createdAt) ?? new Date()
      };
    },
    (batch) => prisma.comment.createMany({ data: batch, skipDuplicates: true })
  );
}

/** @param {import('mongodb').Db} db @param {string} collection @param {(doc: Record<string, unknown>) => object | null} mapFn @param {(batch: object[]) => Promise<{ count: number }>} insertFn */
async function migrateGameCollection(db, collection, mapFn, insertFn) {
  if (!(await collectionExists(db, collection))) {
    console.log(`[${collection}] skipped (collection not found)`);
    return 0;
  }
  return migrateInBatches(collection, db.collection(collection).find({}), mapFn, insertFn);
}

/** @param {import('mongodb').Db} db */
async function migrateGameScores(db) {
  return migrateGameCollection(
    db,
    'game_scores',
    (doc) => ({
      id: generateCuid(),
      email: String(doc.email),
      nickname: String(doc.nickname),
      game: doc.game != null ? String(doc.game) : 'slot',
      bet: Number(doc.bet),
      payout: Number(doc.payout),
      delta: Number(doc.delta),
      balance: Number(doc.balance),
      reels: Array.isArray(doc.reels) ? doc.reels.map(String) : [],
      createdAt: toDate(doc.createdAt) ?? new Date(),
      updatedAt: toDate(doc.updatedAt) ?? toDate(doc.createdAt) ?? new Date()
    }),
    (batch) => prisma.gameScore.createMany({ data: batch, skipDuplicates: true })
  );
}

/** @param {import('mongodb').Db} db */
async function migrateGameScore2048(db) {
  return migrateGameCollection(
    db,
    'game_score_2048',
    (doc) => ({
      id: generateCuid(),
      email: String(doc.email),
      nickname: String(doc.nickname),
      score: Number(doc.score),
      createdAt: toDate(doc.createdAt) ?? new Date(),
      updatedAt: toDate(doc.updatedAt) ?? toDate(doc.createdAt) ?? new Date()
    }),
    (batch) => prisma.gameScore2048.createMany({ data: batch, skipDuplicates: true })
  );
}

/** @param {import('mongodb').Db} db */
async function migrateGameScoreMinesweeper(db) {
  return migrateGameCollection(
    db,
    'game_score_minesweeper',
    (doc) => ({
      id: generateCuid(),
      email: String(doc.email),
      nickname: String(doc.nickname),
      mode: String(doc.mode),
      time: Number(doc.time),
      createdAt: toDate(doc.createdAt) ?? new Date(),
      updatedAt: toDate(doc.updatedAt) ?? toDate(doc.createdAt) ?? new Date()
    }),
    (batch) => prisma.gameScoreMinesweeper.createMany({ data: batch, skipDuplicates: true })
  );
}

/** @param {import('mongodb').Db} db */
async function migrateGameScoreWatermelon(db) {
  return migrateGameCollection(
    db,
    'game_score_watermelon',
    (doc) => ({
      id: generateCuid(),
      email: String(doc.email),
      nickname: String(doc.nickname),
      score: Number(doc.score),
      createdAt: toDate(doc.createdAt) ?? new Date(),
      updatedAt: toDate(doc.updatedAt) ?? toDate(doc.createdAt) ?? new Date()
    }),
    (batch) => prisma.gameScoreWatermelon.createMany({ data: batch, skipDuplicates: true })
  );
}

/** @param {import('mongodb').Db} db */
async function migrateSlotUserBalance(db) {
  return migrateGameCollection(
    db,
    'slot_user_balance',
    (doc) => ({
      id: generateCuid(),
      email: String(doc.email),
      nickname: String(doc.nickname),
      balance: Number(doc.balance ?? 0),
      totalSpin: Number(doc.totalSpin ?? 0),
      createdAt: toDate(doc.createdAt) ?? new Date(),
      updatedAt: toDate(doc.updatedAt) ?? toDate(doc.createdAt) ?? new Date()
    }),
    (batch) => prisma.slotUserBalance.createMany({ data: batch, skipDuplicates: true })
  );
}

/** @param {import('mongodb').Db} db */
async function migrateMemos(db) {
  for (const name of ['memos', 'memo']) {
    if (await collectionExists(db, name)) {
      return migrateInBatches(
        name,
        db.collection(name).find({}),
        (doc) => ({
          id: generateCuid(),
          email: String(doc.email),
          toEmail: String(doc.toEmail),
          content: String(doc.content ?? ''),
          deny: Boolean(doc.deny),
          createdAt: toDate(doc.created_at),
          lastModified: toDate(doc.last_modified)
        }),
        (batch) => prisma.memo.createMany({ data: batch, skipDuplicates: true })
      );
    }
  }
  console.log('[memos] skipped (collection not found)');
  return 0;
}

/** @param {import('mongodb').Db} db */
async function migrateLoginLogs(db) {
  if (!(await collectionExists(db, 'login_logs'))) {
    console.log('[login_logs] skipped (collection not found)');
    return 0;
  }

  return migrateInBatches(
    'login_logs',
    db.collection('login_logs').find({}),
    (doc) => ({
      id: typeof doc.id === 'string' && doc.id ? doc.id : generateCuid(),
      at: toDate(doc.at) ?? new Date(),
      userId: doc.userId != null ? String(doc.userId) : doc.user_id != null ? String(doc.user_id) : null,
      ip: String(doc.ip ?? 'unknown'),
      deviceId: doc.deviceId ?? doc.device_id ?? null,
      userAgent: doc.userAgent ?? doc.user_agent ?? null,
      provider: doc.provider ?? null,
      path: doc.path ?? null
    }),
    (batch) => prisma.loginLog.createMany({ data: batch, skipDuplicates: true })
  );
}

/** @param {import('ioredis').default} redis */
async function migrateRedisAlarms(redis) {
  const prefix = `${REDIS_PREFIX}alarms:data:`;
  let cursor = '0';
  let scanned = 0;
  let migrated = 0;
  /** @type {object[]} */
  let batch = [];

  try {
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', SCAN_COUNT);
      cursor = next;

      for (const key of keys) {
        scanned += 1;
        const raw = await redis.get(key);
        if (!raw) continue;

        let alarm;
        try {
          alarm = JSON.parse(raw);
        } catch {
          console.warn(`[alarms] skip invalid JSON: ${key}`);
          continue;
        }

        const updatedAt = toDate(alarm.updatedAt ?? alarm.createdAt);
        if (updatedAt && Date.now() - updatedAt.getTime() > ALARM_MAX_AGE_MS) {
          continue;
        }

        const alarmId =
          alarm._id != null
            ? String(alarm._id)
            : key.startsWith(prefix)
              ? key.slice(prefix.length)
              : null;
        if (!alarmId || !alarm.email || !alarm.articleId) {
          console.warn(`[alarms] skip incomplete alarm: ${key}`);
          continue;
        }

        batch.push({
          id: alarmId,
          email: String(alarm.email),
          boardId: String(alarm.boardId ?? ''),
          articleId: String(alarm.articleId),
          title: String(alarm.title ?? ''),
          parentCommentId: alarm.comment ? String(alarm.comment) : alarm.parentCommentId ?? null,
          commentContent: alarm.commentContent ?? null,
          commentIds: Array.isArray(alarm.comments)
            ? alarm.comments.map(String)
            : Array.isArray(alarm.commentIds)
              ? alarm.commentIds.map(String)
              : [],
          readAt: toDate(alarm.readAt),
          createdAt: toDate(alarm.createdAt) ?? updatedAt ?? new Date(),
          updatedAt: updatedAt ?? new Date()
        });

        if (batch.length >= BATCH) {
          for (const row of batch) {
            await prisma.alarm.upsert({
              where: { id: row.id },
              create: row,
              update: row
            });
          }
          migrated += batch.length;
          console.log(`[alarms] ${migrated} rows upserted...`);
          batch = [];
        }
      }
    } while (cursor !== '0');

    if (batch.length > 0) {
      for (const row of batch) {
        await prisma.alarm.upsert({
          where: { id: row.id },
          create: row,
          update: row
        });
      }
      migrated += batch.length;
    }

    console.log(`[alarms] done: ${migrated} rows upserted (scanned ${scanned} redis keys)`);
    return migrated;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[alarms] migration failed: ${msg}`);
  }
}

async function main() {
  console.log('Starting MongoDB + Redis → PostgreSQL migration');
  console.log(`Mongo DB: ${DB_NAME}, batch size: ${BATCH}`);

  const mongo = new MongoClient(MONGODB_CONNECTION_STRING);
  /** @type {import('ioredis').default | null} */
  let redis = null;

  try {
    await mongo.connect();
    const db = mongo.db(DB_NAME);
    console.log('[mongo] connected');

    const counts = {};
    counts.users = await migrateUsers(db);
    counts.accounts = await migrateAccounts(db);
    counts.sessions = await migrateSessions(db);
    counts.articles = await migrateArticles(db);
    counts.comments = await migrateComments(db);
    counts.game_scores = await migrateGameScores(db);
    counts.game_score_2048 = await migrateGameScore2048(db);
    counts.game_score_minesweeper = await migrateGameScoreMinesweeper(db);
    counts.game_score_watermelon = await migrateGameScoreWatermelon(db);
    counts.slot_user_balance = await migrateSlotUserBalance(db);
    counts.memos = await migrateMemos(db);
    counts.login_logs = await migrateLoginLogs(db);

    if (REDIS_URL) {
      redis = new Redis(REDIS_URL);
      counts.alarms = await migrateRedisAlarms(redis);
    } else {
      console.warn('[alarms] skipped — REDIS_URL not set');
      counts.alarms = 0;
    }

    console.log('\n=== Migration summary ===');
    for (const [table, count] of Object.entries(counts)) {
      console.log(`  ${table}: ${count}`);
    }
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await mongo.close().catch(() => {});
    if (redis) await redis.quit().catch(() => {});
    await prisma.$disconnect().catch(() => {});
    if (process.exitCode === 1) process.exit(1);
  }
}

main();

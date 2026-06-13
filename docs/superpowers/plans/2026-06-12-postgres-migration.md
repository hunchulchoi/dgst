# MongoDB + Redis → PostgreSQL Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영 MongoDB+Redis 스택을 PostgreSQL 단일 DB(Prisma LOGGED + UNLOGGED 캐시)로 전환하고, 운영 데이터를 보존하며 cutover한다.

**Architecture:** Prisma Client가 영구 데이터·Auth를 담당하고, `pgCache.js`가 Redis `client.js`와 동일 API로 UNLOGGED 테이블(`cache_kv`, `rate_limit`, `dedup_lock`)에 접근한다. 마이그레이션은 점검 중 일괄 cutover(`scripts/migrate-mongo-to-pg.js`).

**Tech Stack:** SvelteKit 2, Prisma 6, PostgreSQL, `@auth/prisma-adapter`, Vitest

**Spec:** `docs/superpowers/specs/2026-06-12-postgres-migration-design.md`

---

## File Map

| 파일                                   | 책임                                  |
| -------------------------------------- | ------------------------------------- |
| `prisma/schema.prisma`                 | 전체 LOGGED 모델                      |
| `prisma/migrations/*/migration.sql`    | UNLOGGED raw SQL 포함                 |
| `src/lib/database/prisma.js`           | PrismaClient 싱글톤                   |
| `src/lib/server/cache/pgCache.js`      | UNLOGGED 캐시 (Redis client API 호환) |
| `src/lib/server/cache/pgRateLimit.js`  | rate_limit 테이블 INCR 로직           |
| `src/lib/server/cache/pgDedup.js`      | dedup_lock SET NX 로직                |
| `src/lib/server/auth/prismaAdapter.js` | PrismaAdapter + pgCache 캐시 래퍼     |
| `src/lib/server/alarm/alarmService.js` | Redis alarmService → Prisma Alarm     |
| `scripts/migrate-mongo-to-pg.js`       | 운영 데이터 이전                      |
| `scripts/verify-migration.js`          | cutover 검증                          |
| `tests/pgCache.test.js`                | UNLOGGED 캐시 단위 테스트             |

**제거 대상 (Phase 7):** `mongoosePriomise.js`, `clientPromise.js`, `src/lib/models/*`, `src/lib/server/redis/*`, `hybridAdapter.js`

**대량 수정 (Phase 3~5):** `src/routes/**`, `src/lib/server/**` — `Article.find` → `prisma.article.findMany` 등

---

## Phase 1: Prisma + UNLOGGED 인프라

### Task 1: Prisma 패키지 설치

**Files:**

- Modify: `package.json`

- [ ] **Step 1: 의존성 설치**

```bash
npm install @prisma/client @auth/prisma-adapter
npm install -D prisma
```

- [ ] **Step 2: package.json scripts 추가**

```json
"db:generate": "prisma generate",
"db:migrate": "prisma migrate dev",
"db:push": "prisma db push",
"db:studio": "prisma studio"
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add Prisma and @auth/prisma-adapter dependencies"
```

---

### Task 2: Prisma schema (LOGGED 모델 전체)

**Files:**

- Create: `prisma/schema.prisma`

- [ ] **Step 1: schema.prisma 작성**

`docs/superpowers/specs/2026-06-12-postgres-migration-design.md` §4 전체를 `prisma/schema.prisma`에 복사. datasource:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

- [ ] **Step 2: .env에 DATABASE_URL 추가 (Mongo는 유지 — 병행 개발)**

```
DATABASE_URL="postgresql://user:pass@localhost:5432/dgstdb"
```

- [ ] **Step 3: generate**

```bash
npx prisma generate
```

Expected: `✔ Generated Prisma Client`

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add Prisma schema for Postgres migration"
```

---

### Task 3: 초기 migration + UNLOGGED 테이블

**Files:**

- Create: `prisma/migrations/<timestamp>_init/migration.sql` (prisma migrate가 생성 후 수정)

- [ ] **Step 1: migrate dev 실행**

```bash
npx prisma migrate dev --name init
```

- [ ] **Step 2: 생성된 migration.sql 맨 아래에 UNLOGGED 추가**

```sql
-- UNLOGGED cache tables (Prisma schema 미지원)
CREATE UNLOGGED TABLE cache_kv (
  namespace  TEXT        NOT NULL,
  key        TEXT        NOT NULL,
  value      JSONB       NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (namespace, key)
);
CREATE INDEX cache_kv_expires_idx ON cache_kv (expires_at);
CREATE INDEX cache_kv_ns_key_prefix_idx ON cache_kv (namespace, key text_pattern_ops);

CREATE UNLOGGED TABLE rate_limit (
  bucket     TEXT PRIMARY KEY,
  count      INT NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE UNLOGGED TABLE dedup_lock (
  key        TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);
```

- [ ] **Step 3: 이미 적용됐으면 수동 SQL 실행 또는 migrate reset (개발 DB만)**

```bash
npx prisma db execute --file prisma/migrations/<timestamp>_init/migration.sql
```

- [ ] **Step 4: Commit**

```bash
git add prisma/migrations/
git commit -m "feat: add UNLOGGED cache tables to initial migration"
```

---

### Task 4: Prisma client 싱글톤

**Files:**

- Create: `src/lib/database/prisma.js`

- [ ] **Step 1: prisma.js 작성**

```javascript
import { PrismaClient } from '@prisma/client';
import { DATABASE_URL } from '$env/static/private';
import logger from '$lib/util/logger.js';

/** @type {PrismaClient | undefined} */
let prisma;

/** @returns {PrismaClient} */
export function getPrisma() {
  if (!prisma) {
    prisma = new PrismaClient({
      datasources: { db: { url: DATABASE_URL } }
    });
  }
  return prisma;
}

/** @returns {Promise<void>} */
export async function connectPrisma() {
  const client = getPrisma();
  await client.$connect();
  logger.info({ message: '[postgres] connected via Prisma' });
}

export default getPrisma;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/database/prisma.js
git commit -m "feat: add Prisma client singleton"
```

---

### Task 5: pgCache.js (Redis client API 호환)

**Files:**

- Create: `src/lib/server/cache/pgCache.js`
- Create: `tests/pgCache.test.js`

- [ ] **Step 1: 실패 테스트 작성**

```javascript
// tests/pgCache.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import getPrisma from '../src/lib/database/prisma.js';
import * as pgCache from '../src/lib/server/cache/pgCache.js';

const NS = 'test';
const KEY = 'unit:' + Date.now();

beforeAll(async () => {
  await getPrisma().$connect();
});

afterAll(async () => {
  await pgCache.del(KEY, NS);
  await getPrisma().$disconnect();
});

describe('pgCache', () => {
  it('setJson and getJson round-trip', async () => {
    const payload = { foo: 'bar', n: 1 };
    const ok = await pgCache.setJson(KEY, payload, 60, NS);
    expect(ok).toBe(true);
    const got = await pgCache.getJson(KEY, NS);
    expect(got).toEqual(payload);
  });

  it('returns null after expiry', async () => {
    const k = KEY + ':exp';
    await pgCache.setJson(k, { x: 1 }, 1, NS);
    await new Promise((r) => setTimeout(r, 1100));
    const got = await pgCache.getJson(k, NS);
    expect(got).toBeNull();
  });

  it('delByPrefix removes matching keys', async () => {
    await pgCache.setJson('pfx:a', { a: 1 }, 60, NS);
    await pgCache.setJson('pfx:b', { b: 1 }, 60, NS);
    await pgCache.delByPrefix('pfx:', NS);
    expect(await pgCache.getJson('pfx:a', NS)).toBeNull();
    expect(await pgCache.getJson('pfx:b', NS)).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

```bash
npm run test:unit -- tests/pgCache.test.js
```

Expected: FAIL — module not found

- [ ] **Step 3: pgCache.js 구현**

```javascript
import getPrisma from '$lib/database/prisma.js';
import logger from '$lib/util/logger.js';

const DEFAULT_TTL_SECONDS = 1800;

/**
 * @param {string} logicalKey
 * @param {string} [namespace='default']
 */
function fullKey(logicalKey, namespace = 'default') {
  return { namespace, key: logicalKey };
}

/**
 * @param {string} k
 * @param {string} [namespace]
 * @returns {Promise<string | null>}
 */
export async function get(k, namespace = 'default') {
  try {
    const rows = await getPrisma().$queryRaw`
      DELETE FROM cache_kv
      WHERE namespace = ${namespace} AND key = ${k} AND expires_at < NOW()
      RETURNING key`;
    void rows;
    const hit = await getPrisma().$queryRaw`
      SELECT value::text FROM cache_kv
      WHERE namespace = ${namespace} AND key = ${k} AND expires_at >= NOW()
      LIMIT 1`;
    if (!Array.isArray(hit) || hit.length === 0) return null;
    return hit[0].value;
  } catch (err) {
    logger.warn({ message: '[pgCache] get failed', key: k, namespace, error: String(err) });
    return null;
  }
}

/**
 * @param {string} k
 * @param {string} v
 * @param {number} [ttlSeconds]
 * @param {string} [namespace]
 * @returns {Promise<boolean>}
 */
export async function set(k, v, ttlSeconds = DEFAULT_TTL_SECONDS, namespace = 'default') {
  try {
    const expires = new Date(Date.now() + ttlSeconds * 1000);
    await getPrisma().$executeRaw`
      INSERT INTO cache_kv (namespace, key, value, expires_at)
      VALUES (${namespace}, ${k}, ${v}::jsonb, ${expires})
      ON CONFLICT (namespace, key)
      DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`;
    return true;
  } catch (err) {
    logger.warn({ message: '[pgCache] set failed', key: k, namespace, error: String(err) });
    return false;
  }
}

/**
 * @param {string} k
 * @param {object} v
 * @param {number} [ttlSeconds]
 * @param {string} [namespace]
 * @returns {Promise<boolean>}
 */
export async function setJson(k, v, ttlSeconds = DEFAULT_TTL_SECONDS, namespace = 'default') {
  return set(k, JSON.stringify(v), ttlSeconds, namespace);
}

/**
 * @param {string} k
 * @param {string} [namespace]
 * @returns {Promise<object | null>}
 */
export async function getJson(k, namespace = 'default') {
  const raw = await get(k, namespace);
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * @param {string} k
 * @param {string} [namespace]
 * @returns {Promise<boolean>}
 */
export async function del(k, namespace = 'default') {
  try {
    await getPrisma().$executeRaw`
      DELETE FROM cache_kv WHERE namespace = ${namespace} AND key = ${k}`;
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} prefix
 * @param {string} [namespace]
 * @returns {Promise<boolean>}
 */
export async function delByPrefix(prefix, namespace = 'default') {
  try {
    await getPrisma().$executeRaw`
      DELETE FROM cache_kv
      WHERE namespace = ${namespace} AND key LIKE ${prefix + '%'}`;
    return true;
  } catch {
    return false;
  }
}

/**
 * @returns {Promise<boolean>}
 */
export async function isAvailable() {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function purgeExpired() {
  try {
    await getPrisma().$executeRaw`DELETE FROM cache_kv WHERE expires_at < NOW()`;
    await getPrisma().$executeRaw`DELETE FROM rate_limit WHERE expires_at < NOW()`;
    await getPrisma().$executeRaw`DELETE FROM dedup_lock WHERE expires_at < NOW()`;
  } catch (err) {
    logger.warn({ message: '[pgCache] purgeExpired failed', error: String(err) });
  }
}
```

> **Note:** `set()`에서 string value를 jsonb로 넣을 때 `::jsonb` 캐스트 사용. plain string TTL cache(`boardlist:total`)는 `setRaw` 헬퍼를 추가하거나 value를 JSON string `"123"`으로 저장.

- [ ] **Step 4: 테스트 통과 확인**

```bash
DATABASE_URL="postgresql://..." npm run test:unit -- tests/pgCache.test.js
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/cache/pgCache.js tests/pgCache.test.js
git commit -m "feat: add pgCache UNLOGGED cache module with tests"
```

---

## Phase 2: Auth 전환

### Task 6: prismaAdapter + 캐시 레이어

**Files:**

- Create: `src/lib/server/auth/prismaAdapter.js`
- Modify: `src/lib/server/auth/userCache.js`
- Modify: `src/lib/server/auth/sessionCache.js`
- Modify: `src/hooks.server.js`

- [ ] **Step 1: userCache.js — redis import를 pgCache로 교체**

```javascript
// 변경: import * as redis from '$lib/server/redis/client.js';
import * as pgCache from '$lib/server/cache/pgCache.js';
const NAMESPACE = 'user';
// redis.getJson(USER_ID_PREFIX + id) → pgCache.getJson(USER_ID_PREFIX + id, NAMESPACE)
// redis.setJson(...) → pgCache.setJson(..., USER_CACHE_TTL, NAMESPACE)
// redis.del(...) → pgCache.del(..., NAMESPACE)
```

- [ ] **Step 2: sessionCache.js — 동일 패턴, NAMESPACE = 'session'**

- [ ] **Step 3: prismaAdapter.js 작성**

```javascript
import { PrismaAdapter } from '@auth/prisma-adapter';
import getPrisma from '$lib/database/prisma.js';
import * as userCache from '$lib/server/auth/userCache.js';
import * as sessionCache from '$lib/server/auth/sessionCache.js';
import logger from '$lib/util/logger.js';

/** @type {import('@auth/core/adapters').Adapter | null} */
let cachedAdapter = null;

export function getPrismaAdapter() {
  if (cachedAdapter) return cachedAdapter;

  const base = PrismaAdapter(getPrisma());

  cachedAdapter = {
    ...base,
    async getUser(id) {
      const cached = await userCache.getCachedUserById(id);
      if (cached) return cached;
      const user = await base.getUser(id);
      if (user) await userCache.setCachedUser(user);
      return user;
    },
    async getUserByEmail(email) {
      const cached = await userCache.getCachedUserByEmail(email);
      if (cached) return cached;
      const user = await base.getUserByEmail(email);
      if (user) await userCache.setCachedUser(user);
      return user;
    },
    async updateUser(user) {
      const updated = await base.updateUser(user);
      await userCache.invalidateUser(user.id);
      return updated;
    },
    async getSessionAndUser(sessionToken) {
      try {
        const cached = await sessionCache.getCachedSessionAndUser(sessionToken);
        if (cached) return cached;
        const result = await base.getSessionAndUser(sessionToken);
        if (result) await sessionCache.setCachedSessionAndUser(sessionToken, result);
        return result;
      } catch (err) {
        logger.warn({ message: '[auth] getSessionAndUser failed', error: String(err) });
        return null;
      }
    },
    async deleteSession(sessionToken) {
      await sessionCache.invalidateSession(sessionToken);
      return base.deleteSession(sessionToken);
    }
  };

  return cachedAdapter;
}
```

- [ ] **Step 4: hooks.server.js 교체**

```javascript
// 제거: import clientPromise from '$lib/database/clientPromise.js';
// 제거: import { getHybridAdapter } from '$lib/server/auth/hybridAdapter.js';
import { getPrismaAdapter } from '$lib/server/auth/prismaAdapter.js';
import getPrisma from '$lib/database/prisma.js';

// SvelteKitAuth adapter:
adapter: (getPrismaAdapter(),
  // login_logs: db.collection('login_logs').insertOne →
  await getPrisma().loginLog.create({
    data: { at: new Date(), userId, ip, deviceId, userAgent, provider, path }
  }));
```

- [ ] **Step 5: 수동 테스트**

```bash
npm run dev
# Google/Kakao 로그인 → 프로필 조회 → 로그아웃
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/auth/ src/hooks.server.js
git commit -m "feat: switch Auth to Prisma adapter with pgCache layer"
```

---

## Phase 3: 게시판 (Article, Comment)

### Task 7: board repository 헬퍼

**Files:**

- Create: `src/lib/server/board/articleRepo.js`
- Create: `src/lib/server/board/commentRepo.js`

- [ ] **Step 1: articleRepo.js — Mongoose 쿼리 래퍼**

주요 함수:

- `findArticleById(id)`
- `findArticlesByBoard({ boardId, state, pageNo, pageUnit })`
- `createArticle(data)` — 새 ID는 `new ObjectId().toString()` 대신 `crypto.randomBytes(12).toString('hex')` (24자 hex, Mongo 호환)
- `updateArticle(id, data)`
- `deleteArticle(id)`
- `countArticles({ boardId, state })`

- [ ] **Step 2: commentRepo.js**

- `findCommentsByArticle({ articleId, boardId })`
- `createComment(data)` — article.comments $push 제거, Comment insert만
- `deleteComment(id)` — article $pull 제거
- `toggleCommentLike(...)` — `likes` String[] 업데이트: `prisma.$executeRaw` 또는 read-modify-write

- [ ] **Step 3: 라우트 파일 일괄 수정**

| 파일                                                             | 변경                            |
| ---------------------------------------------------------------- | ------------------------------- |
| `src/routes/board/[boardId]/[[pageNo]]/+page.server.js`          | Article.find → articleRepo      |
| `src/routes/board/[boardId]/write/[[articleId]]/+page.server.js` | Article.create/save             |
| `src/routes/board/.../[articleId]/+page.server.js`               | findOne + populate 제거         |
| `src/routes/board/.../comment/+server.js`                        | Comment + upsertAlarm (Phase 4) |
| `src/routes/board/.../like/+server.js`                           | likes 배열 업데이트             |
| `src/routes/board/.../delete/+server.js`                         | cascade delete                  |
| `src/lib/server/boardArticleList.js`                             | Prisma 쿼리                     |
| `src/lib/server/submitDedup.js`                                  | findRecentDuplicate → Prisma    |

- [ ] **Step 4: 검증**

```bash
npm run check
# 게시글 목록·상세·작성·댓글·좋아요 수동 테스트
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: migrate board articles and comments to Prisma"
```

---

## Phase 4: 알림 (Redis → Alarm 테이블)

### Task 8: alarmService Postgres 전환

**Files:**

- Create: `src/lib/server/alarm/alarmService.js`
- Modify: 알림 import 경로 (comment, delete, alarm pages, slot page, api routes)
- Delete (Phase 7): `src/lib/server/redis/alarmService.js`

- [ ] **Step 1: alarmService.js 핵심 함수**

```javascript
import getPrisma from '$lib/database/prisma.js';

export async function getUnreadAlarmCount(email, hours = 24) {
  const since = new Date(Date.now() - hours * 3600 * 1000);
  return getPrisma().alarm.count({
    where: { email, readAt: null, updatedAt: { gte: since } }
  });
}

export async function getAlarmList(email, limit = 30) {
  const rows = await getPrisma().alarm.findMany({
    where: { email },
    orderBy: { updatedAt: 'desc' },
    take: limit
  });
  return rows.map((a) => ({
    ...a,
    _id: a.id,
    comments: a.commentIds,
    commentCount: a.commentIds.length
  }));
}

export async function upsertAlarm({
  email,
  articleId,
  title,
  boardId,
  parentCommentId,
  parentCommentContent,
  newCommentId
}) {
  const id = parentCommentId ? `${articleId}_${parentCommentId}` : articleId;
  const existing = await getPrisma().alarm.findUnique({ where: { id } });
  const commentIds = existing?.commentIds ?? [];
  if (newCommentId && !commentIds.includes(newCommentId)) commentIds.push(newCommentId);
  await getPrisma().alarm.upsert({
    where: { id },
    create: {
      id,
      email,
      articleId,
      boardId,
      title,
      parentCommentId: parentCommentId ?? null,
      commentContent: parentCommentContent ?? null,
      commentIds: newCommentId ? [newCommentId] : [],
      readAt: null
    },
    update: {
      title,
      boardId,
      commentIds,
      readAt: null,
      updatedAt: new Date()
    }
  });
}
```

- [ ] **Step 2: import 경로 일괄 변경**

```bash
rg -l "redis/alarmService" src/ | xargs sed -i '' 's|$lib/server/redis/alarmService|$lib/server/alarm/alarmService|g'
```

- [ ] **Step 3: 3일 TTL cron route 추가 (선택)**

`src/routes/api/cron/prune-alarms/+server.js` — `DELETE alarms WHERE updated_at < NOW() - interval '3 days'`

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: migrate alarms from Redis to Postgres Alarm table"
```

---

## Phase 5: 게임·기타 모델

### Task 9: 게임·memo·auth register 전환

**Files:**

- Modify: `src/routes/games/slot/+server.js`, `+page.server.js`
- Modify: `src/routes/games/2048/+server.js`, `+page.server.js`
- Modify: `src/routes/games/minesweeper/+server.js`, `+page.server.js`
- Modify: `src/routes/games/watermelon/+server.js`
- Modify: `src/lib/server/slotUserBalance.js`, `slotStats.js`, `game2048Stats.js`, etc.
- Modify: `src/routes/auth/register/+server.js`, `register/[nickname]/+server.js`, `profile/+server.js`

- [ ] **Step 1: 각 파일에서 Model import 제거 → getPrisma() 사용**

패턴:

```javascript
// Before
import { GameScore } from '$lib/models/gameScore.js';
await GameScore.create({ ... });

// After
import getPrisma from '$lib/database/prisma.js';
await getPrisma().gameScore.create({ data: { ... } });
```

- [ ] **Step 2: slot 랭킹·잔액 쿼리 변환**

`SlotUserBalance.find` → `prisma.slotUserBalance.findMany({ orderBy: { balance: 'desc' } })`

- [ ] **Step 3: 게임 통계 aggregation**

Mongoose `aggregate()` → Prisma `groupBy` 또는 `$queryRaw`

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: migrate game scores and user balance to Prisma"
```

---

## Phase 6: 나머지 Redis → pgCache

### Task 10: rate limit, dedup, boardlist, og, device

**Files:**

- Create: `src/lib/server/cache/pgRateLimit.js`
- Create: `src/lib/server/cache/pgDedup.js`
- Modify: `src/lib/server/apiRateLimit.js`
- Modify: `src/lib/server/auth/rateLimit.js`
- Modify: `src/lib/server/submitDedup.js` (tryAcquireSubmitDedup)
- Modify: `src/lib/server/boardListLoad.js`
- Modify: `src/routes/api/og/+server.js`
- Modify: `src/lib/server/auth/checkSessionDevice.js`
- Modify: `src/hooks.server.js` (redis.setJson → pgCache)

- [ ] **Step 1: pgRateLimit.js**

```javascript
import getPrisma from '$lib/database/prisma.js';

export async function incrementRateLimit(bucket, windowSeconds, limit) {
  const rows = await getPrisma().$queryRaw`
    INSERT INTO rate_limit (bucket, count, expires_at)
    VALUES (${bucket}, 1, NOW() + (${windowSeconds} || ' seconds')::interval)
    ON CONFLICT (bucket) DO UPDATE SET
      count = CASE WHEN rate_limit.expires_at < NOW() THEN 1 ELSE rate_limit.count + 1 END,
      expires_at = CASE WHEN rate_limit.expires_at < NOW()
        THEN NOW() + (${windowSeconds} || ' seconds')::interval
        ELSE rate_limit.expires_at END
    RETURNING count`;
  const count = Number(rows[0]?.count ?? 1);
  return count <= limit;
}
```

- [ ] **Step 2: pgDedup.js — SET NX**

```javascript
export async function tryAcquire(key, ttlSeconds) {
  const rows = await getPrisma().$queryRaw`
    INSERT INTO dedup_lock (key, expires_at)
    VALUES (${key}, NOW() + (${ttlSeconds} || ' seconds')::interval)
    ON CONFLICT DO NOTHING
    RETURNING key`;
  return Array.isArray(rows) && rows.length > 0;
}
```

- [ ] **Step 3: boardListLoad — namespace `boardlist`**

- [ ] **Step 4: warmup.js 수정**

```javascript
import { connectPrisma } from '$lib/database/prisma.js';
import { isAvailable, purgeExpired } from '$lib/server/cache/pgCache.js';

export function warmupConnections() {
  void connectPrisma().catch(...);
  void isAvailable();
  setInterval(() => purgeExpired(), 5 * 60 * 1000);
}
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: replace Redis cache/rate-limit/dedup with Postgres UNLOGGED"
```

---

## Phase 7: 정리 + 마이그레이션 스크립트

### Task 11: migrate-mongo-to-pg.js

**Files:**

- Create: `scripts/migrate-mongo-to-pg.js`
- Create: `scripts/verify-migration.js`

- [ ] **Step 1: migrate 스크립트 골격**

```javascript
import { MongoClient } from 'mongodb';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

const BATCH = 1000;
const prisma = new PrismaClient();

async function migrateUsers(db) {
  const cursor = db.collection('users').find({});
  let batch = [];
  for await (const doc of cursor) {
    batch.push({
      id: doc.id,
      email: doc.email,
      emailVerified:
        doc.emailVerified === true
          ? (doc.created_at ?? new Date())
          : doc.emailVerified instanceof Date
            ? doc.emailVerified
            : null,
      nickname: doc.nickname,
      introduction: doc.introduction ?? '',
      photo: doc.photo ?? null,
      state: doc.state,
      grade: doc.grade ?? 'user',
      createdAt: doc.created_at ?? null,
      latestLoginAt: doc.latest_login_at ?? null,
      lastModified: doc.last_modified ?? null
    });
    if (batch.length >= BATCH) {
      await prisma.user.createMany({ data: batch, skipDuplicates: true });
      batch = [];
    }
  }
  if (batch.length) await prisma.user.createMany({ data: batch, skipDuplicates: true });
}

// migrateSessions, migrateArticles, migrateComments, migrateGameScores...
// migrateRedisAlarms(redis) — SCAN dgst:alarms:data:*

async function main() {
  const mongo = new MongoClient(process.env.MONGODB_CONNECTION_STRING);
  await mongo.connect();
  const db = mongo.db(process.env.DB_NAME ?? 'dgstdb');
  await migrateUsers(db);
  // ... 순서대로
  await mongo.close();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: verify-migration.js**

각 컬렉션 count vs `prisma.*.count()`, orphan comment:

```javascript
const orphan = await prisma.$queryRaw`
  SELECT COUNT(*)::int AS n FROM comments c
  LEFT JOIN articles a ON a.id = c.article_id
  WHERE a.id IS NULL`;
```

- [ ] **Step 3: 스테이징 dry-run**

```bash
MONGODB_CONNECTION_STRING="..." DB_NAME="dgstdb" DATABASE_URL="..." node scripts/migrate-mongo-to-pg.js
node scripts/verify-migration.js
```

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-mongo-to-pg.js scripts/verify-migration.js
git commit -m "feat: add Mongo/Redis to Postgres migration and verify scripts"
```

---

### Task 12: Mongo/Redis 제거

**Files:**

- Delete: `src/lib/database/mongoosePriomise.js`, `clientPromise.js`
- Delete: `src/lib/models/*.js`
- Delete: `src/lib/server/redis/`
- Delete: `src/lib/server/auth/hybridAdapter.js`, `redisSession.js`
- Modify: `package.json` — `mongoose`, `mongodb`, `@auth/mongodb-adapter`, `ioredis` 제거
- Modify: `.env` — `MONGODB_CONNECTION_STRING`, `REDIS_URL`, `DB_NAME` 제거

- [ ] **Step 1: 의존성 제거**

```bash
npm uninstall mongoose mongodb @auth/mongodb-adapter ioredis
```

- [ ] **Step 2: rg로 잔여 import 확인**

```bash
rg "mongoose|mongodb|ioredis|clientPromise|mongoosePriomise|hybridAdapter" src/
```

Expected: no matches

- [ ] **Step 3: 빌드 검증**

```bash
SKIP_DB_CONNECT=true npm run build
npm run check
```

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove MongoDB and Redis dependencies"
```

---

## Phase 8: 운영 Cutover

### Task 13: 점검 배포

- [ ] **Step 1: T-24h 사용자 공지**

- [ ] **Step 2: 백업**

```bash
mongodump --uri="$MONGODB_CONNECTION_STRING" --db=dgstdb --out=./backup-$(date +%Y%m%d)
redis-cli -u "$REDIS_URL" BGSAVE
```

- [ ] **Step 3: 점검 모드 ON → migrate → verify → 배포**

```bash
node scripts/migrate-mongo-to-pg.js
node scripts/verify-migration.js
# verify 통과 시 DATABASE_URL만 있는 .env로 배포
```

- [ ] **Step 4: 스모크 테스트** (spec §9 체크리스트)

- [ ] **Step 5: 점검 해제 또는 롤백**

롤백: 이전 Docker 이미지 + Mongo/Redis `.env` 복원

---

## Spec Coverage Self-Review

| Spec §           | Task        |
| ---------------- | ----------- |
| §3 UNLOGGED      | Task 3, 5   |
| §4 Prisma models | Task 2      |
| §4.1 Auth        | Task 6      |
| §4.2 Community   | Task 7      |
| §4.3 Alarms      | Task 8      |
| §4.4 Games       | Task 9      |
| §6 Migration     | Task 11, 13 |
| §7 Cleanup       | Task 12     |
| §9 Verification  | Task 5, 13  |

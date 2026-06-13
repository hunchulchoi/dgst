# MongoDB + Redis → PostgreSQL 전환 설계

**날짜:** 2026-06-12  
**목표:** 운영 이슈 해소(D) + 인프라 단일화(A)  
**최종 상태:** PostgreSQL 단일 DB (Prisma) + UNLOGGED 캐시 테이블, Redis/MongoDB 제거

---

## 1. 배경

### 현재 스택

- **MongoDB:** Mongoose 11모델 + `@auth/mongodb-adapter` + native `clientPromise`
- **Redis:** 세션/유저 캐시, 알림(영구), 게시판 목록 캐시, rate limit, dedup, OG, device 추적

### 문제

- 앱 기동 시 Mongo 2풀 + Redis 연결 warmup — 장애 지점 분산
- Redis graceful degrade로 캐시 실패가 조용히 넘어가 원인 추적 어려움
- 알림 등 사용자 데이터가 Redis에만 존재 (3일 TTL)
- 운영·모니터링 대상이 3개

### 목표

- 연결 1개(Postgres), 모니터링 1개
- 캐시는 Postgres `UNLOGGED`로 WAL 부담 없이 유지
- 영구 데이터는 LOGGED 테이블 + Prisma

---

## 2. 아키텍처

```
SvelteKit App
  ├── Prisma Client  → LOGGED tables (영구 데이터, Auth)
  └── pgCache.js     → UNLOGGED tables (캐시, rate limit, dedup)
         ↓
    PostgreSQL (단일 인스턴스)
```

**제거 대상:** `mongoose`, `mongodb`, `@auth/mongodb-adapter`, `ioredis`, `REDIS_URL`, `MONGODB_CONNECTION_STRING`

**환경변수:** `DATABASE_URL=postgresql://...`

---

## 3. UNLOGGED 캐시 계층

Prisma schema 미지원 → `prisma migrate`에 raw SQL로 생성, 접근은 `$queryRaw` 전용 모듈.

### 3.1 `cache_kv` — 범용 JSON 캐시

```sql
CREATE UNLOGGED TABLE cache_kv (
  namespace  TEXT        NOT NULL,
  key        TEXT        NOT NULL,
  value      JSONB       NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (namespace, key)
);
CREATE INDEX cache_kv_expires_idx ON cache_kv (expires_at);
CREATE INDEX cache_kv_ns_key_prefix_idx ON cache_kv (namespace, key text_pattern_ops);
```

| namespace   | key 패턴                                      | TTL      | 기존 Redis         |
| ----------- | --------------------------------------------- | -------- | ------------------ |
| `user`      | `id:{id}`, `email:{email}`                    | 30분     | userCache          |
| `session`   | `{token}`                                     | 5분      | sessionCache       |
| `boardlist` | `payload:{boardId}:{page}`, `total:{boardId}` | 5분/60초 | boardListLoad      |
| `og`        | `{url_hash}`                                  | 3시간    | api/og             |
| `device`    | `{sessionToken}`                              | 30일     | checkSessionDevice |

### 3.2 `rate_limit`

```sql
CREATE UNLOGGED TABLE rate_limit (
  bucket     TEXT PRIMARY KEY,
  count      INT NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ NOT NULL
);
```

### 3.3 `dedup_lock`

```sql
CREATE UNLOGGED TABLE dedup_lock (
  key        TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);
```

### 3.4 TTL 정리

- **Lazy:** read 시 `expires_at < NOW()` → delete + miss
- **Background:** 5분 주기 `DELETE WHERE expires_at < NOW()`
- **재시작:** UNLOGGED truncate — cold start 허용 (Redis 빈 상태와 동일)

### 3.5 `pgCache.js`

- Redis `client.js` API 호환: `get`, `set`, `getJson`, `setJson`, `del`, `delByPrefix`
- Redis 미연결 시 graceful degrade 패턴 유지 (Postgres 실패 시 동일)

---

## 4. LOGGED 영구 데이터 — Prisma Schema

### 4.1 Auth.js (`@auth/prisma-adapter`)

표준 모델 + dgst 커스텀 필드 확장. **기존 `users.id`는 OAuth 해시 문자열 — `@default(cuid())` 사용 안 함.**

```prisma
model User {
  id              String    @id
  email           String?   @unique
  emailVerified   DateTime? @map("email_verified")
  // Auth.js 표준 (미사용이나 adapter 호환용 nullable)
  name            String?
  image           String?

  // dgst 커스텀 (기존 Mongo users 필드)
  nickname        String    @unique
  introduction    String
  photo           String?
  state           String
  grade           String    @default("user")
  createdAt       DateTime? @map("created_at")
  latestLoginAt   DateTime? @map("latest_login_at")
  lastModified    DateTime? @map("last_modified")

  accounts Account[]
  sessions Session[]

  @@map("users")
}

model Account {
  id                String @id @default(cuid())
  userId            String @map("user_id")
  type              String
  provider          String
  providerAccountId String @map("provider_account_id")
  user              User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@map("accounts")
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique @map("session_token")
  userId       String   @map("user_id")
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("sessions")
}

model VerificationToken {
  identifier String
  token      String
  expires    DateTime

  @@unique([identifier, token])
  @@map("verification_tokens")
}
```

**Auth adapter 변경:**

- `hybridAdapter.js` → `prismaAdapter.js` (PrismaAdapter + userCache/sessionCache는 pgCache UNLOGGED로 동일 패턴)
- Account: 토큰 필드 저장 안 함 (현행과 동일)

### 4.2 커뮤니티

```prisma
model Article {
  id            String   @id  // 기존 Mongo ObjectId hex 보존
  email         String
  nickname      String
  boardId       String   @map("board_id")
  title         String
  content       String
  state         String   @default("write")
  reads         String[] @default([])
  likes         String[] @default([])
  unlikes       String[] @default([])
  modifiedEmail String?  @map("modified_email")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  comments Comment[]

  @@index([email, createdAt(sort: Desc)])
  @@index([boardId, state, createdAt(sort: Desc)])
  @@map("articles")
}

model Comment {
  id                    String   @id
  email                 String
  nickname              String
  photo                 String?
  boardId               String   @map("board_id")
  articleId             String   @map("article_id")
  parentCommentId       String?  @map("parent_comment_id")
  parentCommentNickname String?  @map("parent_comment_nickname")
  depth                 Int      @default(1)
  content               String?
  image                 String?
  state                 String   @default("write")
  likes                 String[] @default([])
  unlikes               String[] @default([])
  modifiedEmail         String?  @map("modified_email")
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")

  article Article @relation(fields: [articleId], references: [id], onDelete: Cascade)

  @@index([email])
  @@index([articleId, createdAt(sort: Desc)])
  @@index([parentCommentId])
  @@map("comments")
}
```

**변경점:**

- `article.comments` ObjectId 배열 제거 → `Comment` FK + `COUNT`로 대체 (기존 `$push`/`$pull` 로직을 relation 기반으로 변경)
- `likes`/`reads`/`unlikes`: `String[]` 유지 (마이그레이션 단순화). 필요 시 GIN 인덱스 추가

### 4.3 알림 (Redis → LOGGED)

```prisma
model Alarm {
  id             String    @id  // `{articleId}` 또는 `{articleId}_{parentCommentId}`
  email          String
  boardId        String    @map("board_id")
  articleId      String    @map("article_id")
  title          String
  parentCommentId String?  @map("parent_comment_id")
  commentContent String?   @map("comment_content")
  commentIds     String[]  @default([]) @map("comment_ids")
  readAt         DateTime? @map("read_at")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  @@index([email, updatedAt(sort: Desc)])
  @@index([email, readAt, createdAt(sort: Desc)])
  @@index([articleId])
  @@map("alarms")
}
```

- Redis ZSET 정렬 → `ORDER BY updated_at DESC`
- 3일 TTL: cron `DELETE FROM alarms WHERE updated_at < NOW() - INTERVAL '3 days'` (기존 `ALARM_TTL` 동작 유지)

### 4.4 게임

```prisma
model GameScore {
  id        String   @id @default(cuid())
  email     String
  nickname  String
  game      String   @default("slot")
  bet       Int
  payout    Int
  delta     Int
  balance   Int
  reels     String[]
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([game, createdAt(sort: Desc)])
  @@index([game, bet, createdAt(sort: Desc)])
  @@index([email, createdAt(sort: Desc)])
  @@map("game_scores")
}

model GameScore2048 {
  id        String   @id @default(cuid())
  email     String
  nickname  String
  score     Int
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([createdAt(sort: Desc)])
  @@index([email, score(sort: Desc)])
  @@map("game_score_2048")
}

model GameScoreMinesweeper {
  id        String   @id @default(cuid())
  email     String
  nickname  String
  mode      String
  time      Int
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([createdAt(sort: Desc)])
  @@index([email, mode, time])
  @@map("game_score_minesweeper")
}

model GameScoreWatermelon {
  id        String   @id @default(cuid())
  email     String
  nickname  String
  score     Int
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([createdAt(sort: Desc)])
  @@index([email, score(sort: Desc)])
  @@map("game_score_watermelon")
}

model SlotUserBalance {
  id        String   @id @default(cuid())
  email     String   @unique
  nickname  String
  balance   Int      @default(0)
  totalSpin Int      @default(0) @map("total_spin")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([balance(sort: Desc)])
  @@map("slot_user_balance")
}

model GameLog {
  id        String   @id @default(cuid())
  game      String
  action    String
  email     String?
  meta      Json?
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([game])
  @@index([email])
  @@index([createdAt(sort: Desc)])
  @@map("game_logs")
}
```

### 4.5 기타

```prisma
model Memo {
  id           String   @id @default(cuid())
  email        String   @unique
  toEmail      String   @unique @map("to_email")
  content      String
  deny         Boolean  @default(false)
  createdAt    DateTime? @map("created_at")
  lastModified DateTime? @map("last_modified")

  @@map("memos")
}

model LoginLog {
  id        String   @id @default(cuid())
  at        DateTime @default(now())
  userId    String?  @map("user_id")
  ip        String
  deviceId  String?  @map("device_id")
  userAgent String?  @map("user_agent")
  provider  String?
  path      String?

  @@index([at(sort: Desc)])
  @@index([userId])
  @@map("login_logs")
}
```

---

## 5. 구현 Phase

| Phase | 내용                                                                                  | 완료 기준                             |
| ----- | ------------------------------------------------------------------------------------- | ------------------------------------- |
| **1** | Prisma init, migrate, `DATABASE_URL`, UNLOGGED raw SQL, `pgCache.js`, `prisma` client | Postgres 연결 + 캐시 모듈 단위 테스트 |
| **2** | Auth: `@auth/prisma-adapter`, User 확장, sessionCache/userCache → pgCache             | 로그인/세션/프로필 동작               |
| **3** | Article, Comment Prisma 전환, `article.comments` 배열 제거                            | 게시판 CRUD·댓글·좋아요               |
| **4** | Alarm LOGGED + alarmService Postgres 전환                                             | 알림 목록/읽음/upsert                 |
| **5** | 게임·memo·login_logs 전환                                                             | slot/2048/minesweeper/watermelon      |
| **6** | rate_limit, dedup_lock, boardlist/og 캐시 → pgCache                                   | Redis 의존 제거                       |
| **7** | Mongo/Redis 패키지·파일 삭제, warmup 단순화, `.env` 정리                              | 빌드·배포 성공                        |

---

## 6. 데이터 마이그레이션 (운영 DB — 실제 데이터 있음)

**전략:** 짧은 점검 시간 내 **일괄 cutover** (dual-write 없음). 사전 스테이징 dry-run으로 검증.

### 6.1 사전 준비 (점검 전)

| 항목                 | 내용                                                                         |
| -------------------- | ---------------------------------------------------------------------------- |
| **백업**             | MongoDB `mongodump`, Redis `BGSAVE` + RDB 복사, Postgres는 빈 상태에서 시작  |
| **스테이징 dry-run** | 운영 DB 스냅샷 복원 → 마이그레이션 스크립트 → 건수·샘플 검증                 |
| **검증 스크립트**    | `scripts/verify-migration.js` — 컬렉션별 row count, FK 무결성, 샘플 URL 조회 |
| **롤백 준비**        | 이전 Docker 이미지 + `.env` Mongo/Redis connection string 보관               |

### 6.2 마이그레이션 순서 (`scripts/migrate-mongo-to-pg.js`)

FK 의존성 순서로 batch insert (`createMany` + `skipDuplicates`):

1. **users** — `id` 문자열 보존, `emailVerified` Boolean→DateTime 변환
2. **accounts** — `userId` FK, 토큰 필드 제외 (현행과 동일)
3. **sessions** — **필수 이전** (미이전 시 전원 재로그인). `sessionToken`·`expires` 보존
4. **articles** — `_id` → `id` (ObjectId hex 문자열)
5. **comments** — `_id`·`articleId` FK, `article.comments` 배열은 무시 (Comment 테이블이 source of truth)
6. **game_scores**, **game_score_2048**, **game_score_minesweeper**, **game_score_watermelon** — 대용량은 cursor batch (1000건)
7. **slot_user_balance**, **memos**, **login_logs**
8. **Redis alarms** — `SCAN alarms:data:*` → `alarms` (TTL 만료분 스킵, `comment`→`parentCommentId`, `comments`→`commentIds`)

### 6.3 Cutover 절차 (점검 15~30분)

```
T-24h  공지 (점검 예고)
T-0    ① 점검 모드 ON (503 또는 읽기 전용 middleware)
T+0    ② 최종 mongodump (delta 없음 — 쓰기 차단 상태)
T+5    ③ migrate-mongo-to-pg.js 실행
T+15   ④ verify-migration.js — 건수·FK·샘플 게시글 URL
T+20   ⑤ DATABASE_URL 전환, Postgres 버전 배포
T+25   ⑥ 스모크 테스트 (로그인·게시글·알림·슬롯)
T+30   ⑦ 점검 해제
```

**세션:** `sessions` 컬렉션 이전으로 **기존 로그인 유지** 목표. 실패 시에만 전원 재로그인 안내.

**알림:** Redis 3일 TTL 데이터만 이전 가능. 만료된 알림은 복구 불가 (현행과 동일).

**캐시(UNLOGGED):** 이전 불필요 — cold start 허용.

### 6.4 검증 기준 (cutover 게이트)

| 체크                | 기준                                     |
| ------------------- | ---------------------------------------- |
| users               | Mongo count = Postgres count             |
| articles + comments | count 일치, 랜덤 10건 title/content 일치 |
| sessions            | count 일치 (활성 세션 유지)              |
| game_scores         | count 일치 (±0)                          |
| slot_user_balance   | email·balance 일치                       |
| alarms              | Redis 잔존 키 수 ≈ Postgres alarms count |
| FK                  | orphan comment 0건                       |

### 6.5 롤백

1. 점검 모드 유지
2. 이전 Docker 이미지 + `MONGODB_CONNECTION_STRING` / `REDIS_URL` `.env` 복원
3. Mongo/Redis는 백업 그대로 — **Postgres 쓰기 기간이 없으므로** Mongo 데이터 무결성 유지
4. 원인 분석 후 dry-run 재실행

**롤백 가능 창:** Postgres에 운영 쓰기가 시작되기 전까지만 안전. 점검 중 쓰기 차단이 전제.

---

## 7. 코드 변경 요약

| 제거                                      | 추가/교체                                          |
| ----------------------------------------- | -------------------------------------------------- |
| `mongoosePriomise.js`, `clientPromise.js` | `src/lib/database/prisma.js`                       |
| `src/lib/models/*.js` (11개)              | Prisma Client 타입                                 |
| `hybridAdapter.js`                        | `prismaAdapter.js` + pgCache 캐시 레이어           |
| `src/lib/server/redis/*`                  | `src/lib/server/cache/pgCache.js`                  |
| `ioredis`, `mongoose`, `mongodb`          | `@prisma/client`, `prisma`, `@auth/prisma-adapter` |

**warmup.js:** `connectDB` + `clientPromise` + `redis.getClient` → `prisma.$connect()` + pgCache ping

---

## 8. 리스크 & 완화

| 리스크                                     | 완화                                            |
| ------------------------------------------ | ----------------------------------------------- |
| UNLOGGED 캐시 재시작 시 소실               | DB fallback (현행 Redis miss와 동일)            |
| `String[]` likes 배열 성능                 | 초기 유지, 문제 시 junction table 분리          |
| Auth User `emailVerified` Boolean→DateTime | 마이그레이션: true→`created_at`, false→null     |
| article.comments 배열 제거                 | Comment count 쿼리로 대체, 마이그레이션 시 검증 |
| 대용량 game_scores                         | 인덱스 동일 유지, 필요 시 파티셔닝 검토         |

---

## 9. 검증 체크리스트

- [ ] Google/Kakao OAuth 로그인·로그아웃
- [ ] 게시글 작성/수정/삭제/목록/페이지네이션
- [ ] 댓글 CRUD, 알림 생성·읽음·삭제
- [ ] 슬롯 스핀·잔액·랭킹
- [ ] 2048/minesweeper/watermelon 점수 저장·랭킹
- [ ] rate limit / submit dedup
- [ ] 재시작 후 캐시 cold start 정상 (UNLOGGED)
- [ ] `npm run build` + Docker 이미지 빌드

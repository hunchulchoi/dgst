# PostgreSQL Cutover 운영 런북

**대상:** MongoDB + Redis → PostgreSQL 일괄 전환  
**설계 문서:** `docs/superpowers/specs/2026-06-12-postgres-migration-design.md` §6  
**예상 점검 시간:** 15~30분 (dual-write 없음, 쓰기 차단 후 일괄 cutover)

---

## 1. 사전 준비 (점검 전)

### 1.1 백업

| 대상 | 명령·작업 | 보관 위치 |
|------|-----------|-----------|
| MongoDB | `mongodump --uri="$MONGODB_CONNECTION_STRING" --db=dgstdb --out=./backup-$(date +%Y%m%d)` | 오프사인 복사본 |
| Redis | `redis-cli -u "$REDIS_URL" BGSAVE` 후 RDB 파일 복사 | 오프사인 복사본 |
| Postgres | cutover 직전 **빈 스키마** 상태에서 시작 (데이터는 마이그레이션 스크립트로 적재) | — |

### 1.2 스테이징 dry-run

1. 운영 MongoDB·Redis 스냅샷을 스테이징에 복원
2. 스테이징 Postgres에 스키마 적용: `npx prisma migrate deploy`
3. 마이그레이션 실행: `npm run db:migrate-data`
4. 검증 실행: `npm run db:verify-migration`
5. §6.4 검증 기준·§9 스모크 테스트 수행
6. dry-run 실패 시 cutover 일정 연기 — 운영 cutover 전 반드시 통과

### 1.3 DATABASE_URL 설정

**개발·스테이징 (마이그레이션 검증용)**

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/dgstdb"
```

**운영 cutover 시점 (T+20)**

- `.env` / 배포 시크릿에서 `DATABASE_URL`만 Postgres로 전환
- `MONGODB_CONNECTION_STRING`, `REDIS_URL` 제거 (또는 주석 — 롤백용 백업본은 별도 보관)
- 마이그레이션 스크립트 실행 시에는 **소스** 연결도 필요:

```env
# 마이그레이션 스크립트 전용 (cutover 중, T+0~T+20)
DATABASE_URL="postgresql://..."          # 대상 Postgres
MONGODB_CONNECTION_STRING="mongodb://..." # 소스 Mongo
REDIS_URL="redis://..."                   # 소스 Redis (알림)
DB_NAME="dgstdb"
```

**롤백용 백업:** cutover 직전 Mongo/Redis `.env` 스냅샷 + 이전 Docker 이미지 태그를 문서화해 보관

### 1.4 롤백 준비

- [ ] 이전 Docker 이미지 태그 기록
- [ ] Mongo/Redis `.env` 백업본 저장
- [ ] 점검 모드(503/읽기 전용) 토글 방법 확인

---

## 2. 점검 타임라인 (T-24h ~ T+30)

| 시각 | 작업 | 담당 확인 |
|------|------|-----------|
| **T-24h** | 사용자 공지 (점검 일시·예상 소요·재로그인 가능성) | [ ] |
| **T-1h** | on-call 대기, 백업 최종 확인, 스테이징 dry-run 결과 재확인 | [ ] |
| **T-0** | 점검 모드 ON (503 또는 읽기 전용 middleware) — **쓰기 차단** | [ ] |
| **T+0** | 최종 `mongodump` (delta 없음 — 쓰기 차단 상태) | [ ] |
| **T+5** | `npm run db:migrate-data` 실행 | [ ] |
| **T+15** | `npm run db:verify-migration` — 건수·FK·샘플 게시글 URL | [ ] |
| **T+20** | `DATABASE_URL` 전환, Postgres 버전 Docker 이미지 배포 | [ ] |
| **T+25** | 스모크 테스트 (§4 체크리스트) | [ ] |
| **T+30** | 점검 해제 또는 롤백 결정 | [ ] |

---

## 3. 명령어 순서 (Cutover 본편)

**전제:** T-0 점검 모드 ON, Postgres 인스턴스 가동, 스키마 미적용 시 먼저 적용

```bash
# 0) (필요 시) 의존성·Prisma Client
npm ci
npm run db:generate

# 1) Postgres 스키마 적용 (LOGGED + UNLOGGED)
npx prisma migrate deploy

# 2) Mongo/Redis → Postgres 데이터 이전
npm run db:migrate-data
# (= node scripts/migrate-mongo-to-pg.js)

# 3) 검증 — 실패 시 배포 중단, 롤백 절차(§5) 진입
npm run db:verify-migration
# (= node scripts/verify-migration.js)

# 4) verify 통과 후 — DATABASE_URL Postgres만 있는 .env로 배포
#    (Docker 이미지 pull/up 또는 CI 배포 파이프라인)
docker compose -f conf/docker-compose.yml pull dgst
docker compose -f conf/docker-compose.yml up -d dgst
```

**마이그레이션 데이터 순서 (스크립트 내부 FK 순서):**

1. users → 2. accounts → 3. **sessions** → 4. articles → 5. comments  
6. game_scores·2048·minesweeper·watermelon → 7. slot_user_balance·memos·login_logs  
8. Redis alarms (잔존 키만)

---

## 4. 스모크 테스트 체크리스트 (설계 §9)

verify 통과 후, 점검 해제 전에 수동 확인:

- [ ] Google/Kakao OAuth 로그인·로그아웃
- [ ] 게시글 작성/수정/삭제/목록/페이지네이션
- [ ] 댓글 CRUD, 알림 생성·읽음·삭제
- [ ] 슬롯 스핀·잔액·랭킹
- [ ] 2048/minesweeper/watermelon 점수 저장·랭킹
- [ ] rate limit / submit dedup
- [ ] 재시작 후 캐시 cold start 정상 (UNLOGGED)
- [ ] `npm run build` + Docker 이미지 빌드 (배포 전 CI에서 이미 검증된 경우 재확인 생략 가능)

### Cutover 게이트 (verify-migration 기준, §6.4)

| 체크 | 기준 |
|------|------|
| users | Mongo count = Postgres count |
| articles + comments | count 일치, 랜덤 10건 title/content 일치 |
| sessions | count 일치 (활성 세션 유지) |
| game_scores | count 일치 (±0) |
| slot_user_balance | email·balance 일치 |
| alarms | Redis 잔존 키 수 ≈ Postgres alarms count |
| FK | orphan comment 0건 |

---

## 5. 롤백 절차

**롤백 가능 창:** Postgres에 운영 쓰기가 시작되기 **전**까지만 안전. 점검 중 쓰기 차단이 전제.

1. **점검 모드 유지** (사용자 쓰기 계속 차단)
2. **이전 Docker 이미지** 배포 + `.env`에서 `MONGODB_CONNECTION_STRING`·`REDIS_URL` 복원 (`DATABASE_URL` 제거 또는 주석)
3. Mongo/Redis는 T+0 백업 그대로 — Postgres 쓰기 기간이 없으므로 Mongo 데이터 무결성 유지
4. 서비스 스모크 (로그인·게시글 1건) 확인 후 점검 해제
5. 원인 분석 → 스테이징 dry-run 재실행 → cutover 재일정

---

## 6. 주의사항

### sessions — 필수 이전

- `sessions` 컬렉션 이전이 **필수**. 미이전 시 **전 사용자 재로그인** 필요
- `sessionToken`·`expires` 보존 — 기존 로그인 유지 목표
- verify에서 sessions count 일치 확인 후에만 배포 진행

### 알림 — Redis 잔존분만

- Redis 알림은 **3일 TTL** — 만료된 알림은 복구 불가 (현행과 동일)
- `SCAN alarms:data:*`로 **잔존 키만** `alarms` 테이블로 이전
- 기대: Redis 잔존 키 수 ≈ Postgres `alarms` count

### 캐시 (UNLOGGED) — 이전 불필요

- `cache_kv`, `rate_limit`, `dedup_lock`은 cold start 허용
- Postgres 재시작 시 UNLOGGED truncate — Redis 빈 상태와 동일하게 DB fallback

---

## 참고

- 구현 계획: `docs/superpowers/plans/2026-06-12-postgres-migration.md` Task 13
- 마이그레이션 스크립트: `scripts/migrate-mongo-to-pg.js`
- 검증 스크립트: `scripts/verify-migration.js`

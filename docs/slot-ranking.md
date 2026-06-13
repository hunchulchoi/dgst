# 슬롯 랭킹 / game_scores 병목 해소

## 원인

- `game_scores` 테이블에 약 30만 건이 쌓이면서, **랭킹용 집계**가 매번 전체를 `email`+`createdAt` 정렬 후 그룹화해 460~720ms 수준의 지연 발생.
- 인덱스(IXSCAN)를 타더라도, 집계 단계에서 문서를 모두 흐르기 때문에 데이터 증가에 따라 더 느려짐.

## 대응

<!-- @import "[TOC]" {cmd="toc" depthFrom=1 depthTo=6 orderedList=false} -->

### 1. `slot_user_balance` 요약 테이블

- **역할**: 유저별 “현재 잔액·닉네임·총 스핀 수”만 보관.
- **위치**: `prisma/schema.prisma`의 `SlotUserBalance` 모델  
  필드: `email`(unique), `nickname`, `balance`, `totalSpin`, `updatedAt`.
- **인덱스**: `balance DESC` (랭킹 조회), `email` unique.

### 2. GameScore 생성 시 동기 갱신

- 슬롯 스핀·댓글 보상·오링 보충·최초 1000점 지급 등 **모든** `GameScore.create` 직후  
  `updateSlotUserBalance(email, nickname, balance, { incSpin })` 호출로  
  `slot_user_balance`를 upsert.

### 3. 랭킹 API 전환

- **이전**: `game_scores` 전체 정렬 + 그룹화 (수십만 건 스캔).
- **이후**: Prisma `slotUserBalance.findMany({ where: { totalSpin: { gt: 0 } }, orderBy: { balance: 'desc' }, take: 10 })`  
  → 소량 문서만 조회해 응답 시간 단축.

### 4. getTodaySlotStats 인덱스

- `game_scores`에 `(game, created_at DESC)` 인덱스 추가.  
  “오늘” 조건(`createdAt >= startOfKstDay`)으로 스캔 범위 축소.

### 5. 기존 데이터 백필 (자동)

- **자동**: 랭킹 API(`GET /games/slot?rank`)를 **처음 호출할 때** `slot_user_balance`가 비어 있으면  
  `game_scores` 집계로 한 번만 채운 뒤 랭킹을 반환합니다. 별도 스크립트 실행 없이 동작합니다.
- **수동** (필요 시): 프로젝트 루트에서  
  `DATABASE_URL='postgresql://...' node scripts/backfill-slot-user-balance.js`  
  로 같은 백필을 직접 실행할 수 있습니다.

### 6. Top10 점수 초기화(재집계)

- **원인**: `slot_user_balance`가 `game_scores`와 어긋나면 Top10이 잘못 보일 수 있음.
- **방법 1 – Postgres에서 비우기**  
  `TRUNCATE TABLE slot_user_balance;`  
  → 다음에 누군가 랭킹(`?rank=1`) 조회 시 자동 백필로 다시 채워짐.
- **방법 2 – 크론 API**  
  `GET /api/cron/slot-rank-reset` + 헤더 `x-cron-secret: <CRON_SECRET>`  
  → 테이블 초기화 후, 다음 랭킹 요청 시 백필됨.  
  예: `curl -H "x-cron-secret: YOUR_CRON_SECRET" "https://your-domain/api/cron/slot-rank-reset"`

## 관련 파일

| 파일                                       | 역할                                        |
| ------------------------------------------ | ------------------------------------------- |
| `prisma/schema.prisma`                     | 요약 스키마·모델                            |
| `src/lib/server/slotUserBalance.js`        | `updateSlotUserBalance`, `getSlotBalance`   |
| `src/routes/games/slot/+server.js`         | 스핀·랭킹·잔액 조회, 보충 시 balance 반영   |
| `src/routes/games/slot/comment/+server.js` | 댓글 보상 시 balance 반영                   |
| `src/lib/server/slotStats.js`              | 오늘 스핀/유저 수 (game_scores + 인덱스)    |
| `prisma/schema.prisma`                     | game_scores 인덱스 (`game`, `createdAt` 등) |
| `scripts/backfill-slot-user-balance.js`    | 1회 백필 스크립트                           |

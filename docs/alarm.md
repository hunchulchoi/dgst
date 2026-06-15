# 알림 서비스

경로: `src/lib/server/alarm/alarmService.js`

## 1. 개요

게시판과 슬롯 댓글에서 발생하는 알림을 PostgreSQL `alarms` 테이블에 저장합니다. Redis 알림 저장소는 PostgreSQL 전환 과정에서 제거되었고, cutover 시 Redis에 남아 있던 3일 TTL 알림만 `scripts/migrate-mongo-to-pg.js`로 이전합니다.

## 2. 데이터 구조

### 2.1. 테이블

- **테이블**: `alarms`
- **Prisma 모델**: `Alarm`
- **주요 필드**
  - `id`: `{articleId}` 또는 `{articleId}_{parentCommentId}`
  - `email`: 알림 수신자
  - `articleId`, `boardId`, `title`: 원문 식별 정보
  - `parentCommentId`, `commentContent`: 댓글 알림 맥락
  - `commentIds`: 알림에 포함된 새 댓글 ID 배열
  - `readAt`: 읽음 처리 시각
  - `createdAt`, `updatedAt`: 생성/수정 시각

### 2.2. 인덱스

- `email, updatedAt DESC`: 알림 목록 조회
- `email, readAt, createdAt DESC`: 읽지 않은 알림 조회
- `articleId`: 게시글 삭제 시 연관 알림 삭제

### 2.3. 식별자 규칙

1. **게시글의 새 댓글 알림**: `{articleId}`
2. **댓글의 새 대댓글 알림**: `{articleId}_{parentCommentId}`

같은 대상의 알림은 하나의 row로 갱신하고, `commentIds`에 새 댓글 ID를 추가합니다.

## 3. 서비스 함수

1. **`upsertAlarm({ ... })`**
   - 댓글 또는 대댓글 등록 시 알림을 생성/갱신합니다.
   - 기존 알림이 있으면 `commentIds`를 추가하고 `readAt`을 `null`로 되돌립니다.

2. **`markAsRead(email, articleId)`**
   - 사용자가 관련 게시글/게임 페이지에 들어오면 해당 article 기반 알림을 읽음 처리합니다.
   - `{articleId}`와 `{articleId}_*` 알림을 함께 처리합니다.

3. **`getUnreadAlarmCount(email, hours = 24)`**
   - 최근 `hours` 시간 안에 갱신된 읽지 않은 댓글 알림 수를 반환합니다.
   - 같은 대상의 알림이 한 row로 묶여도 `commentIds` 개수 기준으로 셉니다.
   - 기본 탑 네비게이션의 안 읽은 뱃지에 사용됩니다.

4. **`getAlarmList(email, limit = 30)`**
   - `/board/alarm` 페이지에서 최신 알림 목록을 반환합니다.
   - DB row는 기존 클라이언트 형태에 맞춰 `normalizeAlarmRecord()`에서 정규화합니다.

5. **`deleteAlarmsByArticle(articleId)`**
   - 게시글 삭제 시 원문과 하위 댓글 알림을 함께 삭제합니다.

6. **`removeCommentFromAlarm({ email, articleId, parentCommentId, commentId })`**
   - 댓글 삭제 시 알림의 `commentIds`에서 해당 댓글을 제거합니다.
   - 댓글이 하나도 남지 않으면 알림 row를 삭제합니다.

7. **`pruneExpiredAlarms()`**
   - 3일보다 오래된 알림을 삭제합니다.
   - `/api/cron/prune-alarms`에서 호출됩니다.

## 4. 운영 메모

- 알림 보존 기간은 3일입니다.
- Redis 이전분은 cutover 시점에 남아 있던 키만 옮깁니다. 이미 만료된 Redis 알림은 복구 대상이 아닙니다.
- 알림 저장 실패는 댓글 작성 자체를 막지 않도록 서비스 함수 내부에서 로깅 후 흡수합니다.

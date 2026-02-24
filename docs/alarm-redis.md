# 알람 서비스 (Redis 기반) 문서

경로: `src/lib/server/redis/alarmService.js`

## 1. 개요
이 시스템은 SvelteKit 환경에서 **게시판(Board)** 및 **슬롯 게임(Slot)** 내 사용자의 알림(새 댓글, 대댓글 등 작성 시 피드백) 기능을 빠르고 효율적으로 제공하기 위해 구축되었습니다.
알림 조회 및 쓰기와 같은 빈번한 연산을 Primary Database 엔진에서 분리하여 서버 부하를 최소화하고자 **Redis**를 도입했습니다.

## 2. 데이터 아키텍처 (Redis Data Types)

이 시스템은 정렬 및 조회를 담당하는 ZSET 구조와 실제 데이터를 담는 String 구조를 결합하여 설계되었습니다. 만료기간(TTL)은 30일로 지정되어 불필요한 장기 보관을 지양합니다. (`ALARM_TTL = 60 * 60 * 24 * 30`)

### 2.1. 사용자별 알림 목록: `Sorted Set` (ZSET)
* **키(Key)**: `alarms:list:{email}` (Prefix 포함)
* **값(Value/Member)**: 알람의 고유 ID (`alarmId`)
* **점수(Score)**: 타임스탬프(`Date.now()`). 알림이 처음 생성되거나 추가 댓글 발생 등으로 업데이트될 때마다 이 스코어가 갱신되어 최상단 목록으로 끌어올려집니다.
* **주 사용처**: 시간순(최신순) 정렬, Pagination(`zrevrange`), 특정 기간 조회(`zrevrangebyscore`).

### 2.2. 알림 상세 데이터: `String` (해시 맵 대용 Key-Value)
* **키(Key)**: `alarms:data:{alarmId}`
* **값(Value)**: `JSON.stringify()` 된 객체
* **포함 데이터**:
  - 알림 제목 / 연관 `boardId`
  - 원문 게시물 ID (`articleId`)
  - 부모 댓글 ID / 본문
  - 새로 달린 댓글 배열 (`comments: []`)
  - 읽음 처리 여부 (`readAt`) / 생성 및 수정 일자

### 2.3. 식별자(Alarm ID) 규칙
알림의 응집도 향상을 위해 다음과 같은 규칙대로 `alarmId`를 만들어 사용합니다.

1. **게시글의 새 댓글 알림**: `{articleId}`
2. **댓글의 새 대댓글(답글) 알림**: `{articleId}_{parentCommentId}`

## 3. 핵심 기능 제공 단위 (서비스 함수)

1. **`upsertAlarm({ ... })` (알림 생성/갱신)**
   - 댓글 또는 대댓글 등록 시 작동합니다.
   - 키 존재 여부에 따라 새로 데이터를 만들거나, 대댓글이 추가된 것이라면 배열 안에 푸시하고 최신 상태로 시간을 갱신(`readAt = null` 재설정 포함)합니다.
   - 그 후 String을 `setex` 하고 자신의 zset 스코어를 최신시각으로 `zadd` 합니다.

2. **`markAsRead(email, articleId)` (알림 읽기 처리)**
   - 사용자가 원문 게시판 혹은 관련 게임 페이지로 접속 시 자동으로 호출되어, `{articleId}` 관련 알람 및 그 하위의 `{articleId}_(comment_id)` 파생 알림의 `readAt` 속성을 현재 시각으로 설정합니다. 이를 통해 상단 '읽지 않음(New)' 뱃지가 해제됩니다.

3. **`getUnreadAlarmCount(email, hours = 24)` (안 읽은 알림 개수 조회)**
   - 기본 탑 네비게이션(GNB)의 사용자 메뉴 등에 안 읽은 뱃지 표시용 API입니다.
   - 성능 최적화를 위해 무한 스캔을 하지 않고 `ZREVRANGEBYSCORE`를 활용하여 기본값 24시간 범위 안에서 바뀐 알람만 `mget`을 통해 파싱한 뒤, `readAt == null`인 것을 카운팅합니다.

4. **`getAlarmList(email, limit = 30)` (사용자 알림 목록 조회)**
   - 알림 전용 뷰 메뉴(`/board/alarm`)에서 쓰입니다.
   - 개인 ZSET(`email`)의 `zrevrange`로 최신 ID 목록을 빼오고 `mget`으로 일괄 질의하여 클라이언트로 JSON 객체 배열을 응답합니다. (빈 값은 안전하게 정리합니다.)

5. **`deleteAlarmsByArticle(articleId)` (원본 게시글 삭제에 따른 연쇄 정리 프로세스)**
   - 게시글 파기 시 발생할 수 있는 고아성 데이터 정리를 담당합니다.
   - 성능 저하를 방지하기 위해 `KEYS *`가 아닌 `SCAN` 명령어와 100개 단위의 `cursor`를 사용해 논-블로킹(Non-blocking) 방식으로 매치 패턴(`alarms:data:{articleId}*`)의 모든 관련 키들을 삭제합니다.

## 4. 운영 / 장애 대응 패턴 (Graceful Degradation)
모든 알람 서비스 내부 로직 진입 시, **Redis 클라이언트 인스턴스 초기화 체크 로직 (`if (!client) return`) 이 강제**되어 있습니다.
이로 인해 일시적인 트래픽 폭증이나 Redis 서버 응답 불가 상황이 오더라도, 코어 비즈니스인 회원들의 **댓글/게시물 작성 플로우 등 메인 기능은 타격 없이 정상 수행**될 수 있도록 방어 설계가 적용되어 있습니다.

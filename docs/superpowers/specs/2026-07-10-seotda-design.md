# Solo Seotda (NPC) Design

## Goal

혼자 하는 라이트 섯다. 유저 1명 + NPC 3명. 슬롯과 분리된 전용 칩 잔고로 연속 테이블 플레이.

## Route

`/games/seotda`

## Rules (lite)

- 화투 20장 (1~10월 × 2). 1·3·8은 광 1장 + 비광 1장.
- 인당 2장.
- 족보: 38광땡 > 13/18광땡 > 장땡~삥땡 > 알리 > 독사 > 구삥 > 장삥 > 장사 > 세륙 > 갑오~끗.
- 특수족보(암행어사·땡잡이·구사) 없음.
- 베팅: ante 10 → 다이 / 콜 / 레이즈(×2, 올인 허용).

## Architecture

서버 권위. 클라 = UI + 액션.

- `seotdaEngine.js` — 덱·족보·비교·팟
- `seotdaNpc.js` — 뻥카 AI (허세왕 / 냉정 / 도박사)
- `seotdaState.js` — 메모리 `Map<email, round>`
- `seotdaBalance.js` — `GameScore` `game:'seotda'` 잔고/오링/랭킹
- `+server.js` — GET / POST start|act|ack

스키마 변경 없음. `SlotUserBalance` 미사용.

## Balance

- 첫 지급 1000
- 오링 후 5분 → 700 보충 (슬롯과 동일 타이밍, 지갑 분리)
- 랭킹: email별 최신 balance Top10
- NPC 파산 시 즉시 리필. 유저만 오링 대기.

## NPC bluff

| ID      | 이름   | 성향                         |
| ------- | ------ | ---------------------------- |
| bluffer | 허세왕 | 약한 패도 레이즈, 맞받아치기 |
| calm    | 냉정   | 중간만 콜, 가끔 슬로우플레이 |
| gambler | 도박사 | 폴드 or 빅레이즈             |

판마다 최소 1명은 압박(레이즈) 시도. 쇼다운 전 NPC 패 미전송.

## API

- `GET` — 잔고, Top10, 진행 중 공개 상태
- `POST start` — ante·배분, 유저 패만
- `POST act` — die|call|raise → NPC 자동
- `POST ack` — 쇼다운 연출 끝

## UI

테이블 중앙 팟·로그, 하단 유저 패+버튼, NPC 3명 뒷면+말풍선, 사이드 잔고·Top10. 헤더 게임 메뉴에 섯다 링크.

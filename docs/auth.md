# 로그인·인증 (Auth)

SvelteKit + Auth.js 기반 인증 구조와 Redis 연동을 정리한 문서입니다.

---

## 1. 개요

- **라이브러리**: [@auth/sveltekit](https://authjs.dev/getting-started/installation?framework=sveltekit) (Auth.js)
- **세션 전략**: Database Session (MongoDB 저장)
- **사용자·계정 저장**: MongoDB  
- **세션·검증 토큰 저장**: MongoDB
- **회원정보 조회**: Redis 캐시 우선, 미스 시 MongoDB 조회 후 캐시

---

## 2. 로그인 방식 (Providers)

| Provider | 용도 | 필수 환경 변수 |
|----------|------|----------------|
| **Google** | OAuth 2.0 | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| **Kakao** | OAuth 2.0 (선택) | `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET` |
| **Credentials** | VIP 전용 이메일/비밀번호 | `VIP_EMAIL`, `VIP_FAKE_EMAIL` |

- 신규 가입 후 첫 이동: `/auth/profile` (프로필 설정)
- 카카오는 환경 변수가 없으면 비활성화되며, 콘솔에 경고가 출력됩니다.

---

## 3. 세션

- **전략**: `strategy: 'database'` (JWT 아님)
- **저장소**: MongoDB (`sessions` 컬렉션)
- **만료**: `maxAge: 30일`, `updateAge: 24시간` (갱신 주기)
- **쿠키**
  - 개발: `authjs.session-token`
  - 프로덕션: `__Secure-authjs.session-token`, `secure: true`
  - `httpOnly`, `sameSite: 'lax'`, `path: '/'`

Redis는 세션 저장소가 아니므로, Redis 재시작/장애와 무관하게 세션은 MongoDB에서 유지됩니다.

---

## 4. Hybrid Adapter

- **위치**: `src/lib/server/auth/hybridAdapter.js`
- **역할**
  - User / Account: MongoDB Adapter에 위임
  - Session / VerificationToken: MongoDB Adapter 기본 구현 사용
  - 회원정보: Redis 캐시 → 미스 시 MongoDB 조회 후 캐시

| 메서드 | 저장소 |
|--------|--------|
| createUser, getUser, getUserByEmail, getUserByAccount, updateUser, deleteUser, linkAccount, unlinkAccount | MongoDB |
| createSession, getSessionAndUser, updateSession, deleteSession | MongoDB |
| createVerificationToken, useVerificationToken | MongoDB |

---

## 5. 회원정보 캐시 (Redis)

- **위치**: `src/lib/server/auth/userCache.js`
- **키**: `dgst:user:id:<id>`, `dgst:user:email:<email>`
- **TTL**: 30분 (기본, `REDIS_TTL_SECONDS`로 변경 가능)
- **무효화**
  - Adapter `updateUser` 호출 시 `user:id` 삭제
  - 프로필 수정 API(`PATCH /auth/profile`) 성공 시 `invalidateUser` 호출

---

## 6. 보안

- **Auth Rate Limit**: `/auth/*` POST 요청에 대해 IP당 30회/분 제한 (Redis 사용)
- **세션 폐기**: Redis에서 해당 세션 키 삭제 시 즉시 로그아웃 처리 가능
- **세션·기기 불일치 로그 (추이 관찰)**
  - 글쓰기·댓글 요청 시 세션 쿠키 기준으로 Redis에 저장된 deviceId/UA와 현재 요청의 `dgst_device` 쿠키·User-Agent를 비교
  - 불일치 시 `logger.error`로만 기록 (요청은 그대로 진행)
  - 적용 위치: 게시글 작성(`board.write`), 보드 댓글(`board.comment`), 슬롯 댓글(`games.slot.comment`)
  - Redis 키: `session_device:<sessionToken>`, TTL 30일
  - 구현: `src/lib/server/auth/checkSessionDevice.js` → `checkAndLogSessionDevice(event, { action })`

---

## 7. 환경 변수

### 필수 (Auth 공통)

| 변수 | 설명 |
|------|------|
| `NEXTAUTH_SECRET` | 세션 서명용 비밀 키 |
| `DB_NAME` | MongoDB DB 이름 (Adapter에서 사용) |

### Google

| 변수 | 설명 |
|------|------|
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret |

### Kakao (선택)

| 변수 | 설명 |
|------|------|
| `KAKAO_CLIENT_ID` | 카카오 REST API 키 |
| `KAKAO_CLIENT_SECRET` | 카카오 Client Secret |

### Credentials (VIP)

| 변수 | 설명 |
|------|------|
| `VIP_EMAIL` | 실제 VIP 이메일 (허용 목록) |
| `VIP_FAKE_EMAIL` | 로그인 시 사용하는 대표 이메일 |

### Redis

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `REDIS_URL` | Redis 연결 URL. 없으면 Redis 미사용(세션은 MongoDB만 사용) | - |
| `REDIS_PREFIX` | 키 접두사 | `dgst:` |
| `REDIS_TTL_SECONDS` | 캐시 TTL(초) | `1800` (30분) |

- **로컬 개발**: `.env`에 `REDIS_URL=redis://localhost:6379` 설정 시 Redis 사용
- **Docker**: `conf/docker-compose.yml`에서 `dgst_svelte`에 `REDIS_URL=redis://redis:6379` 설정됨

---

## 8. Docker (Redis)

- **이미지**: `dhi/redis:8` (Docker Hardened Images)
- **서비스명**: `redis`, 네트워크: `dgst-svelte-net`
- **볼륨**: `dgst-redis-vol:/data` (데이터 유지)
- **포트**: `6379:6379`

앱 컨테이너(`dgst_svelte`)는 `depends_on: redis` 및 `REDIS_URL=redis://redis:6379`로 Redis에 연결합니다.

---

## 9. 관련 파일

| 경로 | 역할 |
|------|------|
| `src/hooks.server.js` | SvelteKitAuth 설정, providers, callbacks, session/cookies, rate limit |
| `src/lib/server/auth/hybridAdapter.js` | MongoDB + Redis Hybrid Adapter |
| `src/lib/server/auth/redisSession.js` | Redis 세션·검증 토큰 읽기/쓰기 |
| `src/lib/server/auth/userCache.js` | 회원정보 Redis 캐시 및 무효화 |
| `src/lib/server/auth/rateLimit.js` | Auth 경로 Redis 기반 rate limit |
| `src/lib/server/redis/client.js` | Redis 클라이언트 (get/set/del, getJson/setJson) |
| `src/routes/auth/profile/+server.js` | 프로필 수정 API, 수정 후 사용자 캐시 무효화 |

---

## 10. 배포 시 참고

- **JWT → Database Session 전환**으로 기존 JWT 쿠키는 더 이상 유효하지 않습니다. 배포 후 사용자는 한 번 다시 로그인할 수 있습니다.
- Redis가 없어도 동작합니다. `REDIS_URL`이 없거나 연결 실패 시 세션·캐시는 MongoDB/미사용으로 폴백합니다.

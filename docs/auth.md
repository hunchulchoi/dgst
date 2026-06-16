# 로그인·인증 (Auth)

SvelteKit + Auth.js + Prisma 기반 인증 구조를 정리한 문서입니다.

---

## 1. 개요

- **라이브러리**: [@auth/sveltekit](https://authjs.dev/getting-started/installation?framework=sveltekit) (Auth.js)
- **세션 전략**: Database Session
- **사용자·계정·세션 저장**: PostgreSQL (`users`, `accounts`, `sessions`, `verification_tokens`)
- **회원정보·세션 조회 캐시**: `pgCache` (`cache_kv` UNLOGGED 테이블) 우선, 미스 시 Prisma 조회 후 캐시
- **Auth adapter**: `@auth/prisma-adapter`를 감싼 `src/lib/server/auth/prismaAdapter.js`

---

## 2. 로그인 방식 (Providers)

| Provider        | 용도                     | 필수 환경 변수                             |
| --------------- | ------------------------ | ------------------------------------------ |
| **Google**      | OAuth 2.0                | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| **Kakao**       | OAuth 2.0 (선택)         | `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`   |
| **Credentials** | VIP 전용 이메일/비밀번호 | `VIP_EMAIL`, `VIP_FAKE_EMAIL`              |

- 신규 가입 후 첫 이동: `/auth/profile` (프로필 설정)
- Google/Kakao 프로필 이미지는 저장하지 않고, 이메일은 해시 처리해 저장합니다.

---

## 3. 세션

- **전략**: `strategy: 'database'` (JWT 아님)
- **저장소**: PostgreSQL `sessions` 테이블
- **만료**: `maxAge: 30일`, `updateAge: 24시간` (갱신 주기)
- **쿠키**
  - 개발: `authjs.session-token`
  - 프로덕션: `__Secure-authjs.session-token`, `secure: true`
  - `httpOnly`, `sameSite: 'lax'`, `path: '/'`

세션 원본은 PostgreSQL에 저장되고, `getSessionAndUser` 조회 결과만 `pgCache`에 TTL 캐시됩니다. 캐시가 비어도 DB 조회로 복구됩니다.

---

## 4. Prisma Adapter

- **위치**: `src/lib/server/auth/prismaAdapter.js`
- **역할**
  - User / Account / Session / VerificationToken: Prisma Adapter에 위임
  - `getUser`, `getUserByEmail`, `getSessionAndUser`: `pgCache` 우선 조회
  - `updateUser`, `deleteSession`: 관련 캐시 무효화 후 DB 갱신

| 메서드                                                                                        | 원본 저장소           | 캐시          |
| --------------------------------------------------------------------------------------------- | --------------------- | ------------- |
| createUser, updateUser, getUser, getUserByEmail, getUserByAccount, linkAccount, unlinkAccount | PostgreSQL via Prisma | User cache    |
| createSession, getSessionAndUser, updateSession, deleteSession                                | PostgreSQL via Prisma | Session cache |
| createVerificationToken, useVerificationToken                                                 | PostgreSQL via Prisma | 없음          |

---

## 5. 캐시

### 회원정보 캐시

- **위치**: `src/lib/server/auth/userCache.js`
- **키**: `dgst:user:id:<id>`, `dgst:user:email:<email>`
- **TTL**: 30분
- **무효화**
  - Adapter `updateUser` 호출 시 `user:id`, `user:email` 삭제
  - 프로필 수정 API(`PATCH /auth/profile`) 성공 시 `invalidateUser` 호출

### 세션 조회 캐시

- **위치**: `src/lib/server/auth/sessionCache.js`
- **키**: `dgst:session:<sessionToken>`
- **TTL**: 30분
- **무효화**: Adapter `deleteSession` 호출 시 삭제

캐시는 `cache_kv` UNLOGGED 테이블에 저장됩니다. Postgres 재시작 후 비어도 서비스는 DB 미스로 복구됩니다.

---

## 6. 보안

- **Auth Rate Limit**: `/auth/*` POST 요청에 대해 IP당 30회/분 제한 (`rate_limit` UNLOGGED 테이블)
- **Submit Dedup**: 중복 제출 방지용 lock은 `dedup_lock` UNLOGGED 테이블 사용
- **세션·기기 불일치 로그 (추이 관찰)**
  - 글쓰기·댓글 요청 시 세션 쿠키 기준으로 `pgCache`에 저장된 deviceId/UA와 현재 요청의 `dgst_device` 쿠키·User-Agent를 비교
  - 불일치 시 `logger.error`로만 기록 (요청은 그대로 진행)
  - 적용 위치: 게시글 작성(`board.write`), 보드 댓글(`board.comment`), 슬롯 댓글(`games.slot.comment`)
  - 캐시 키: `session_device:<sessionToken>`, TTL 30일
  - 구현: `src/lib/server/auth/checkSessionDevice.js` → `checkAndLogSessionDevice(event, { action })`

---

## 7. 환경 변수

### 필수

| 변수              | 설명                |
| ----------------- | ------------------- |
| `DATABASE_URL`    | PostgreSQL 연결 URL |
| `NEXTAUTH_SECRET` | 세션 서명용 비밀 키 |

### Google

| 변수                   | 설명                       |
| ---------------------- | -------------------------- |
| `GOOGLE_CLIENT_ID`     | Google OAuth Client ID     |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret |

### Kakao (선택)

| 변수                  | 설명                 |
| --------------------- | -------------------- |
| `KAKAO_CLIENT_ID`     | 카카오 REST API 키   |
| `KAKAO_CLIENT_SECRET` | 카카오 Client Secret |

### Credentials (VIP)

| 변수             | 설명                           |
| ---------------- | ------------------------------ |
| `VIP_EMAIL`      | 실제 VIP 이메일 (허용 목록)    |
| `VIP_FAKE_EMAIL` | 로그인 시 사용하는 대표 이메일 |

---

## 8. 관련 파일

| 경로                                   | 역할                                                                  |
| -------------------------------------- | --------------------------------------------------------------------- |
| `src/hooks.server.js`                  | SvelteKitAuth 설정, providers, callbacks, session/cookies, rate limit |
| `src/lib/server/auth/prismaAdapter.js` | Prisma Adapter 래핑, User/Session 캐시                                |
| `src/lib/server/auth/sessionCache.js`  | 세션+유저 조회 결과 캐시                                              |
| `src/lib/server/auth/userCache.js`     | 회원정보 캐시 및 무효화                                               |
| `src/lib/server/auth/rateLimit.js`     | Auth 경로 rate limit                                                  |
| `src/lib/server/cache/pgCache.js`      | UNLOGGED cache_kv 기반 캐시                                           |
| `src/lib/server/cache/pgRateLimit.js`  | UNLOGGED rate_limit 기반 rate limit                                   |
| `src/lib/server/cache/pgDedup.js`      | UNLOGGED dedup_lock 기반 중복 제출 방지                               |
| `src/routes/auth/profile/+server.js`   | 프로필 수정 API, 수정 후 사용자 캐시 무효화                           |

---

## 9. 배포 시 참고

- `DATABASE_URL`이 없으면 Prisma 초기화가 실패합니다.
- 마이그레이션 후 `sessions` 테이블이 이전되어 있으면 기존 database session을 유지할 수 있습니다.
- `cache_kv`, `rate_limit`, `dedup_lock`은 UNLOGGED 테이블이라 재시작 후 비어도 정상 동작합니다.

# dgst

DGST is a SvelteKit 2 application with Auth.js login, board/alarm features, and browser games such as slot, 2048, minesweeper, and watermelon.

The runtime data store is now PostgreSQL via Prisma. Legacy MongoDB and Redis settings remain only for one-off migration and verification scripts.

## Stack

- Svelte 5 + SvelteKit 2
- Prisma + PostgreSQL
- Auth.js (`@auth/sveltekit`)
- Vitest + Playwright

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Use [.env.example](/Users/hunchulchoi/projects/workspace/dgst/.env.example) as the starting point.

Minimum local runtime values:

```env
NODE_ENV="development"
AUTH_SECRET=""
NEXTAUTH_SECRET=""
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
KAKAO_CLIENT_ID=""
KAKAO_CLIENT_SECRET=""
DATABASE_URL="postgresql://postgres:password@localhost:5432/dgstdb"
PUBLIC_GOOGLE_RECAPTCHA_SITE_KEY=""
GOOGLE_RECAPTCHA_SECRET_KEY=""
UPLOAD_PATH=""
MINIO_ENDPOINT=""
MINIO_ACCESS_KEY=""
MINIO_SECRET_KEY=""
MINIO_BUCKET=""
MINIO_REGION=""
```

Notes:

- `DATABASE_URL` is required for app runtime.
- Uploads are stored in MinIO. `UPLOAD_PATH` is only a temporary processing directory.
- `MINIO_ENDPOINT` accepts an HTTP(S) endpoint. `MINIO_BUCKET` accepts either a bucket
  name such as `dgst` or a bucket/key-prefix pair such as `local/dgst`.
- Google/Kakao OAuth and reCAPTCHA are required for the full auth flow.

To copy legacy files from `UPLOAD_PATH` into MinIO without deleting local originals:

```bash
npm run migrate:uploads:minio
```

The migration is idempotent: objects already present in MinIO are skipped.

### 3. Generate Prisma client and apply schema

```bash
npm run db:generate
npx prisma migrate deploy
```

For local-only schema iteration, you can also use:

```bash
npm run db:migrate
```

### 4. Start the app

```bash
npm run dev
```

Open the local URL printed by Vite.

## Common Commands

```bash
npm run dev
npm run build
npm run preview
npm run check
npm run lint
npm run test:unit
npm run test:integration
```

## Database Workflow

### Runtime

- Primary database: PostgreSQL
- ORM / query layer: Prisma
- Auth/session data: PostgreSQL
- Cache / rate-limit / dedup data: PostgreSQL-backed cache tables

### Prisma commands

```bash
npm run db:generate
npm run db:migrate
npm run db:push
npm run db:studio
```

## Verification

Useful checks after environment changes or database work:

```bash
npm run build
npm run preview
```

Recent smoke coverage for this branch confirmed:

- `/`, `/login`, `/board/free/1`, `/board/bug/1` return `200`
- `/auth/signin` redirects correctly
- `/api/board/lotto-summary` returns `200`
- protected game routes return `401` when unauthenticated

## Project Notes

- Keep `conf/docker-compose.yml` changes separate from app/runtime commits unless you are explicitly working on deployment config.
- Do not modify production MongoDB data during migration validation.
- PostgreSQL can start empty before a fresh migration import, but verify data before switching production traffic.

## Lotto Cron

로또 645 공식 결과를 주기적으로 동기화하려면 아래 엔드포인트를 호출합니다.

```bash
curl -s -H "x-cron-secret: $CRON_SECRET" "https://your-domain/api/cron/lotto-official-sync"
```

- 이 호출은 동행복권 최신 회차를 `GameLog`에 저장합니다.
- 화면용 요약은 [`/api/board/lotto-summary`](./src/routes/api/board/lotto-summary/+server.js)를 통해 함께 갱신됩니다.
- 수동으로 특정 회차를 넣고 싶으면 `?drwNo=1180` 같은 쿼리를 붙입니다.
- 크론이 실패하면 [`/health`](./src/routes/health/+server.js)와 같은 방식으로 `x-cron-secret` 검증을 먼저 확인하세요.

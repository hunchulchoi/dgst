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
```

Notes:

- `DATABASE_URL` is required for app runtime.
- `MONGODB_CONNECTION_STRING`, `DB_NAME`, `REDIS_URL`, and `REDIS_PREFIX` are legacy inputs used only by migration and verification scripts.
- Google/Kakao OAuth and reCAPTCHA are required for the full auth flow.

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

## MongoDB / Redis to PostgreSQL Migration

Runtime no longer depends on MongoDB or Redis, but the migration tooling still reads from them.

Required env for migration scripts:

```env
DATABASE_URL="postgresql://..."
MONGODB_CONNECTION_STRING="mongodb://..."
DB_NAME="dgstdb"
REDIS_URL="redis://..."
REDIS_PREFIX="dgst"
```

Run in this order:

```bash
npx prisma migrate deploy
npm run db:migrate-data
npm run db:verify-migration
```

Detailed cutover steps live in [docs/postgres-cutover-runbook.md](/Users/hunchulchoi/projects/workspace/dgst/docs/postgres-cutover-runbook.md).

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

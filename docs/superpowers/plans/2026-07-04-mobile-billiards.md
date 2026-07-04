# Mobile Billiards Implementation Plan

**For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) superpowers:executing-plans implement plan task-by-task. Steps use checkbox (`- [ ]`) syntax tracking.

**Goal:** Add a mobile-first Matter.js billiards game at `/games/billiards`, playable as four-ball now and structured for three-cushion later.

**Architecture:** Put shared billiards constants, modes, roles, speed checks, and four-ball shot evaluation in `gameUtils.ts`. Keep Matter.js engine setup, canvas rendering, and pointer input in the Svelte page. Add a mode-aware Prisma score model and `/games/billiards` server route matching existing game ranking patterns.

**Tech Stack:** SvelteKit, Svelte 5 runes, TypeScript, Matter.js, Prisma, Vitest.

---

### Task 1: Billiards Shared Helpers

**Files:**

- Create: `src/routes/games/billiards/gameUtils.ts`
- Create: `src/routes/games/billiards/gameUtils.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `src/routes/games/billiards/gameUtils.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  BILLIARDS_MODES,
  FOUR_BALL_CHANCES,
  evaluateFourBallShot,
  isActiveBilliardsMode,
  isValidScore,
  stopped
} from './gameUtils';

describe('billiards game helpers', () => {
  it('scores a four-ball shot after the cue ball contacts both red balls', () => {
    const result = evaluateFourBallShot([
      { cueRole: 'red', targetId: 'red-1' },
      { cueRole: 'red', targetId: 'red-2' }
    ]);

    expect(result.scored).toBe(true);
    expect(result.hitRedIds).toEqual(['red-1', 'red-2']);
  });

  it('does not score a four-ball shot after only one red ball contact', () => {
    const result = evaluateFourBallShot([{ cueRole: 'red', targetId: 'red-1' }]);

    expect(result.scored).toBe(false);
    expect(result.hitRedIds).toEqual(['red-1']);
  });

  it('treats balls as stopped only when every speed is under the threshold', () => {
    expect(stopped([{ speed: 0.01 }, { speed: 0.03 }], 0.05)).toBe(true);
    expect(stopped([{ speed: 0.01 }, { speed: 0.08 }], 0.05)).toBe(false);
  });

  it('accepts only active four-ball submissions for now', () => {
    expect(BILLIARDS_MODES.FOUR_BALL).toBe('four-ball');
    expect(FOUR_BALL_CHANCES).toBeGreaterThan(0);
    expect(isActiveBilliardsMode('four-ball')).toBe(true);
    expect(isActiveBilliardsMode('three-cushion')).toBe(false);
    expect(isActiveBilliardsMode('pool')).toBe(false);
  });

  it('validates persisted scores as non-negative safe integers', () => {
    expect(isValidScore(0)).toBe(true);
    expect(isValidScore(12)).toBe(true);
    expect(isValidScore(-1)).toBe(false);
    expect(isValidScore(1.5)).toBe(false);
    expect(isValidScore(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
rtk npm test -- src/routes/games/billiards/gameUtils.spec.ts
```

Expected: FAIL because `./gameUtils` does not exist.

- [ ] **Step 3: Implement minimal helpers**

Create `src/routes/games/billiards/gameUtils.ts`:

```ts
export const BILLIARDS_MODES = {
  FOUR_BALL: 'four-ball',
  THREE_CUSHION: 'three-cushion'
} as const;

export type BilliardsMode = (typeof BILLIARDS_MODES)[keyof typeof BILLIARDS_MODES];
export type ActiveBilliardsMode = typeof BILLIARDS_MODES.FOUR_BALL;
export type BallRole = 'cue' | 'red' | 'opponent';

export interface ShotContact {
  cueRole: BallRole;
  targetId: string;
}

export interface SpeedSample {
  speed: number;
}

export const TABLE_WIDTH = 360;
export const TABLE_HEIGHT = 560;
export const BALL_RADIUS = 10;
export const RAIL_THICKNESS = 18;
export const MAX_SHOT_POWER = 0.075;
export const STOP_SPEED = 0.08;
export const FOUR_BALL_CHANCES = 10;

export function isActiveBilliardsMode(value: unknown): value is ActiveBilliardsMode {
  return value === BILLIARDS_MODES.FOUR_BALL;
}

export function isValidScore(value: unknown): value is number {
  return Number.isSafeInteger(value) && value >= 0;
}

export function stopped(samples: SpeedSample[], threshold = STOP_SPEED): boolean {
  return samples.every((sample) => sample.speed < threshold);
}

export function evaluateFourBallShot(contacts: ShotContact[]): {
  scored: boolean;
  hitRedIds: string[];
} {
  const hitRedIds = Array.from(
    new Set(
      contacts
        .filter((contact) => contact.cueRole === 'red')
        .map((contact) => contact.targetId)
    )
  );

  return {
    scored: hitRedIds.length >= 2,
    hitRedIds
  };
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
rtk npm test -- src/routes/games/billiards/gameUtils.spec.ts
```

Expected: PASS for `gameUtils.spec.ts`.

### Task 2: Prisma Score Model

**Files:**

- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add score model**

Add this model near other game score models:

```prisma
model GameScoreBilliards {
  id        String   @id @default(cuid())
  email     String
  nickname  String
  mode      String
  score     Int
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([createdAt(sort: Desc)])
  @@index([mode, score(sort: Desc), createdAt(sort: Desc)])
  @@index([email, mode, score(sort: Desc)])
  @@map("game_score_billiards")
}
```

- [ ] **Step 2: Generate Prisma client**

Run:

```bash
rtk npx prisma generate
```

Expected: command exits 0 and generated client includes `gameScoreBilliards`.

### Task 3: Ranking Route

**Files:**

- Create: `src/routes/games/billiards/+page.server.js`
- Create: `src/routes/games/billiards/+server.js`

- [ ] **Step 1: Add page load**

Create `src/routes/games/billiards/+page.server.js`:

```js
export async function load({ locals }) {
  const session = await locals.auth();
  return { session };
}
```

- [ ] **Step 2: Add API route**

Create `src/routes/games/billiards/+server.js`:

```js
import { error, json } from '@sveltejs/kit';
import { getPrisma } from '$lib/database/prisma.js';
import { normalizeToIsoString } from '$lib/util/formatRelativeTime.js';
import { BILLIARDS_MODES, isActiveBilliardsMode, isValidScore } from './gameUtils';

async function getRankTop10(mode) {
  const rows = await getPrisma().$queryRaw`
    SELECT email, nickname, mode, score, created_at AS "createdAt"
    FROM (
      SELECT email, nickname, mode, score, created_at,
             ROW_NUMBER() OVER (PARTITION BY email ORDER BY score DESC, created_at DESC) AS rn
      FROM game_score_billiards
      WHERE mode = ${mode}
    ) t
    WHERE rn = 1
    ORDER BY score DESC, created_at DESC
    LIMIT 10
  `;

  return rows.map((row) => ({
    _id: row.email,
    nickname: row.nickname,
    mode: row.mode,
    score: Number(row.score),
    createdAt: normalizeToIsoString(row.createdAt)
  }));
}

export async function GET({ locals, url }) {
  const session = await locals.auth();
  const user = session?.user;
  const email = typeof user?.email === 'string' ? user.email : '';
  if (!email) throw error(401, { message: '로그인이 필요합니다.' });

  const mode = url.searchParams.get('mode') ?? BILLIARDS_MODES.FOUR_BALL;
  if (!isActiveBilliardsMode(mode)) throw error(400, { message: '지원하지 않는 당구 모드입니다.' });

  if (url.searchParams.get('rank')) {
    const [rank, myBest] = await Promise.all([
      getRankTop10(mode),
      (async () => {
        const myDoc = await getPrisma().gameScoreBilliards.findFirst({
          where: { email, mode },
          orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
          select: { score: true, createdAt: true }
        });

        return myDoc
          ? { score: Number(myDoc.score), createdAt: normalizeToIsoString(myDoc.createdAt) }
          : null;
      })()
    ]);

    return json({ rank, myBest, mode });
  }

  return json({ success: true, mode });
}

export async function POST({ request, locals }) {
  const session = await locals.auth();
  const user = session?.user;
  const email = typeof user?.email === 'string' ? user.email : '';
  const nickname = typeof user?.nickname === 'string' ? user.nickname : '';
  if (!email || !nickname) throw error(401, { message: '로그인이 필요합니다.' });

  const body = await request.json().catch(() => null);
  const mode = body?.mode ?? BILLIARDS_MODES.FOUR_BALL;
  const score = Number(body?.score);

  if (!isActiveBilliardsMode(mode)) throw error(400, { message: '지원하지 않는 당구 모드입니다.' });
  if (!isValidScore(score)) throw error(400, { message: '점수가 올바르지 않습니다.' });

  await getPrisma().gameScoreBilliards.create({
    data: { email, nickname, mode, score }
  });

  return json({ success: true, mode, score });
}
```

- [ ] **Step 3: Run checks for route imports**

Run:

```bash
rtk npm run check
```

Expected: no SvelteKit import or type errors.

### Task 4: Mobile Billiards Page

**Files:**

- Create: `src/routes/games/billiards/+page.svelte`

- [ ] **Step 1: Implement Matter.js page**

Create a Svelte page that:

- creates a Matter.js engine, runner, and canvas renderer on mount
- uses fixed internal coordinates `TABLE_WIDTH` by `TABLE_HEIGHT`
- draws green cloth, rails, and three balls on the canvas
- records cue-ball contacts with red balls through `collisionStart`
- supports touch and mouse pointer drag from the cue ball
- maps drag vector to `Body.setVelocity(cueBall, velocity)`
- locks input while balls are moving
- evaluates each shot with `evaluateFourBallShot`
- submits score on game over for logged-in users
- loads rank with `GET /games/billiards?rank=1&mode=four-ball`

Use this state shape:

```ts
type Status = 'aiming' | 'rolling' | 'scored' | 'miss' | 'game-over';

let score = $state(0);
let chances = $state(FOUR_BALL_CHANCES);
let status = $state<Status>('aiming');
let aimStart = $state<{ x: number; y: number } | null>(null);
let aimCurrent = $state<{ x: number; y: number } | null>(null);
let contacts: ShotContact[] = [];
```

- [ ] **Step 2: Run Svelte check**

Run:

```bash
rtk npm run check
```

Expected: no Svelte or TypeScript errors.

### Task 5: Header Navigation

**Files:**

- Modify: `src/lib/components/header.svelte`

- [ ] **Step 1: Add logged-in nav item**

Add this near other game links:

```svelte
<NavItem>
  <NavLink
    href="/games/billiards"
    active={pathname?.startsWith('/games/billiards')}
    class="px-3 text-center"
  >
    <span>🎱</span><span class="d-none d-sm-inline ms-1">당구</span>
  </NavLink>
</NavItem>
```

- [ ] **Step 2: Run Svelte check**

Run:

```bash
rtk npm run check
```

Expected: no Svelte errors.

### Task 6: Final Verification

**Files:**

- Verify all files changed in this plan.

- [ ] **Step 1: Run focused unit test**

Run:

```bash
rtk npm test -- src/routes/games/billiards/gameUtils.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run app check**

Run:

```bash
rtk npm run check
```

Expected: PASS.

- [ ] **Step 3: Review diff**

Run:

```bash
rtk git diff -- src/routes/games/billiards src/lib/components/header.svelte prisma/schema.prisma docs/superpowers/plans/2026-07-04-mobile-billiards.md
```

Expected: diff contains only the billiards feature, navigation entry, Prisma model, and plan.

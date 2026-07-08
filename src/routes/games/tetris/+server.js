import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { getPrisma } from '$lib/database/prisma.js';
import { getTodayTetrisStats } from '$lib/server/gameTetrisStats.js';
import { getGameSession, isLocalGameSmokeSession } from '$lib/server/localGameSmokeSession.js';
import { normalizeToIsoString } from '$lib/util/formatRelativeTime.js';

const TETRIS_GAME = 'tetris';

const scoreBodySchema = z.object({
  action: z.literal('start').optional(),
  score: z.number().finite().nonnegative().optional(),
  stage: z.number().int().min(1).max(10).optional()
});

/**
 * game_logs 기반 전체 기간 email별 최고점 Top10
 */
async function getRankTop10() {
  /** @type {Array<{ email: string; nickname: string; score: number; stage: number; createdAt: Date }>} */
  const rows = await getPrisma().$queryRaw`
    SELECT email, nickname, score, stage, created_at AS "createdAt"
    FROM (
      SELECT
        email,
        COALESCE(meta->>'nickname', 'anonymous') AS nickname,
        (meta->>'score')::int AS score,
        COALESCE((meta->>'stage')::int, 0) AS stage,
        created_at,
        ROW_NUMBER() OVER (
          PARTITION BY email
          ORDER BY (meta->>'score')::int DESC, created_at DESC
        ) AS rn
      FROM game_logs
      WHERE game = ${TETRIS_GAME}
        AND action = 'score'
        AND email IS NOT NULL
        AND meta->>'score' IS NOT NULL
    ) t
    WHERE rn = 1
    ORDER BY score DESC, created_at DESC
    LIMIT 10
  `;
  return rows.map((r) => ({
    _id: r.email,
    nickname: r.nickname,
    score: Number(r.score),
    stage: Number(r.stage),
    createdAt: normalizeToIsoString(r.createdAt)
  }));
}

/**
 * @param {string} email
 */
async function getMyBest(email) {
  /** @type {Array<{ score: number; stage: number; createdAt: Date }>} */
  const rows = await getPrisma().$queryRaw`
    SELECT
      (meta->>'score')::int AS score,
      COALESCE((meta->>'stage')::int, 0) AS stage,
      created_at AS "createdAt"
    FROM game_logs
    WHERE game = ${TETRIS_GAME}
      AND action = 'score'
      AND email = ${email}
      AND meta->>'score' IS NOT NULL
    ORDER BY (meta->>'score')::int DESC, created_at DESC
    LIMIT 1
  `;
  if (!rows.length) return null;
  return {
    score: Number(rows[0].score),
    stage: Number(rows[0].stage),
    createdAt: normalizeToIsoString(rows[0].createdAt)
  };
}

export async function GET(event) {
  const { url } = event;
  const session = await getGameSession(event);
  const user = session?.user;
  const email = typeof user?.email === 'string' ? user.email : '';
  if (!email) throw error(401, { message: '로그인이 필요합니다.' });

  if (url.searchParams.get('rank')) {
    const [rank, myBest, todayStats] = await Promise.all([
      getRankTop10(),
      getMyBest(email),
      getTodayTetrisStats()
    ]);
    return json(
      { rank, myBest, todayStats },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
  return json({});
}

export async function POST(event) {
  const { request } = event;
  const session = await getGameSession(event);
  const user = session?.user;
  const email = typeof user?.email === 'string' ? user.email : '';
  if (!email) throw error(401, { message: '로그인이 필요합니다.' });

  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    throw error(400, { message: 'Invalid JSON' });
  }

  const parsed = scoreBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    throw error(400, { message: '유효하지 않은 요청입니다.' });
  }

  const nickname =
    typeof user === 'object' && 'nickname' in user && typeof user.nickname === 'string'
      ? user.nickname
      : 'anonymous';

  if (parsed.data.action === 'start') {
    if (isLocalGameSmokeSession(session)) return json({ success: true, smoke: true });
    await getPrisma().gameLog.create({
      data: {
        game: TETRIS_GAME,
        action: 'start',
        email,
        meta: { nickname }
      }
    });
    return json({ success: true });
  }

  const score = parsed.data.score;
  if (score == null) {
    throw error(400, { message: '유효한 점수를 보내 주세요.' });
  }
  if (isLocalGameSmokeSession(session)) {
    return json({ success: true, score, stage: parsed.data.stage ?? 0, smoke: true });
  }

  await getPrisma().gameLog.create({
    data: {
      game: TETRIS_GAME,
      action: 'score',
      email,
      meta: {
        nickname,
        score,
        stage: parsed.data.stage ?? 0
      }
    }
  });
  return json({ success: true, score, stage: parsed.data.stage ?? 0 });
}

import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { getPrisma } from '$lib/database/prisma.js';
import { getTodayBreakoutStats } from '$lib/server/gameBreakoutStats.js';
import { getGameSession, isLocalGameSmokeSession } from '$lib/server/localGameSmokeSession.js';
import { normalizeToIsoString } from '$lib/util/formatRelativeTime.js';

const BREAKOUT_GAME = 'breakout';

const scoreBodySchema = z.object({
  action: z.literal('start').optional(),
  score: z.number().finite().nonnegative().optional(),
  stage: z.number().int().min(1).max(50).optional(),
  /** 50단계 전체 클리어(gameWin) */
  win: z.boolean().optional()
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
      WHERE game = ${BREAKOUT_GAME}
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
    WHERE game = ${BREAKOUT_GAME}
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

  if (url.searchParams.get('celebrate')) {
    // 하위호환 — 통합 API로 리다이렉트 성격의 응답
    const { getBoardCelebrations } = await import('$lib/server/boardCelebrations.js');
    const celebrations = await getBoardCelebrations();
    const stage50 = celebrations.find((c) => c.kind === 'breakout50');
    return json(
      {
        celebrations,
        celebration: stage50
          ? {
              active: true,
              clearedAt: stage50.at,
              until: stage50.until,
              nickname: stage50.nickname
            }
          : { active: false, clearedAt: null, until: null, nickname: null }
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  const session = await getGameSession(event);
  const user = session?.user;
  const email = typeof user?.email === 'string' ? user.email : '';
  if (!email) throw error(401, { message: '로그인이 필요합니다.' });

  if (url.searchParams.get('rank')) {
    const [rank, myBest, todayStats] = await Promise.all([
      getRankTop10(),
      getMyBest(email),
      getTodayBreakoutStats()
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
        game: BREAKOUT_GAME,
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
    return json({
      success: true,
      score,
      stage: parsed.data.stage ?? 0,
      win: !!parsed.data.win,
      smoke: true
    });
  }

  await getPrisma().gameLog.create({
    data: {
      game: BREAKOUT_GAME,
      action: 'score',
      email,
      meta: {
        nickname,
        score,
        stage: parsed.data.stage ?? 0,
        ...(parsed.data.win ? { win: true } : {})
      }
    }
  });
  return json({ success: true, score, stage: parsed.data.stage ?? 0 });
}

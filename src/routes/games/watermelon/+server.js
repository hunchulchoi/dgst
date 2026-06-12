import { error, json } from '@sveltejs/kit';
import { getPrisma } from '$lib/database/prisma.js';
import { getTodayWatermelonStats } from '$lib/server/gameWatermelonStats.js';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Get Top 10 scores (highest score per user ID within last 3 days).
 */
async function getRankTop10() {
  const since = new Date(Date.now() - THREE_DAYS_MS);
  /** @type {Array<{ email: string; nickname: string; score: number }>} */
  const rows = await getPrisma().$queryRaw`
    SELECT email, nickname, score
    FROM (
      SELECT email, nickname, score,
        ROW_NUMBER() OVER (PARTITION BY email ORDER BY score DESC) AS rn
      FROM game_score_watermelon
      WHERE created_at >= ${since}
    ) t
    WHERE rn = 1
    ORDER BY score DESC
    LIMIT 10
  `;
  return rows.map((r) => ({
    _id: r.email,
    nickname: r.nickname,
    score: Number(r.score)
  }));
}

export async function GET({ locals, url }) {
  const session = await locals.auth();
  const user = session?.user;
  const email = typeof user?.email === 'string' ? user.email : '';

  if (!email) {
    throw error(401, { message: 'Login required' });
  }

  if (url.searchParams.get('rank')) {
    const [rank, myBest, todayStats] = await Promise.all([
      getRankTop10(),
      (async () => {
        const since = new Date(Date.now() - THREE_DAYS_MS);
        const myDoc = await getPrisma().gameScoreWatermelon.findFirst({
          where: { email, createdAt: { gte: since } },
          orderBy: { score: 'desc' },
          select: { score: true }
        });
        return myDoc?.score ?? null;
      })(),
      getTodayWatermelonStats()
    ]);

    return json(
      { rank, myBest, todayStats },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
  return json({});
}

export async function POST({ locals, request }) {
  const session = await locals.auth();
  const user = session?.user;
  const email = typeof user?.email === 'string' ? user.email : '';
  if (!email) throw error(401, { message: 'Login required' });

  let body;
  try {
    body = await request.json();
  } catch {
    throw error(400, { message: 'Invalid JSON' });
  }

  const nickname =
    typeof user === 'object' && 'nickname' in user && typeof user.nickname === 'string'
      ? user.nickname
      : 'anonymous';

  // 게임 시작 로그 기록
  if (body?.action === 'start') {
    await getPrisma().gameLog.create({
      data: {
        game: 'watermelon',
        action: 'start',
        email,
        meta: { nickname }
      }
    });
    return json({ success: true });
  }

  const score = Number(body?.score);
  if (!Number.isFinite(score) || score < 0) {
    throw error(400, { message: 'Invalid score' });
  }

  await getPrisma().gameScoreWatermelon.create({ data: { email, nickname, score } });
  return json({ success: true, score });
}

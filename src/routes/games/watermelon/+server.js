import { error, json } from '@sveltejs/kit';
import { getPrisma } from '$lib/database/prisma.js';
import { getTodayWatermelonStats } from '$lib/server/gameWatermelonStats.js';
import { attachGameProfilePhotos } from '$lib/server/gameProfilePhotos.js';
import { getGameSession, isLocalGameSmokeSession } from '$lib/server/localGameSmokeSession.js';
import { normalizeToIsoString } from '$lib/util/formatRelativeTime.js';

/**
 * Get Top 10 scores (all-time highest score per user ID).
 */
async function getRankTop10() {
  /** @type {Array<{ email: string; nickname: string; score: number; createdAt: Date }>} */
  const rows = await getPrisma().$queryRaw`
    SELECT email, nickname, score, created_at AS "createdAt"
    FROM (
      SELECT email, nickname, score, created_at,
        ROW_NUMBER() OVER (PARTITION BY email ORDER BY score DESC, created_at DESC) AS rn
      FROM game_score_watermelon
    ) t
    WHERE rn = 1
    ORDER BY score DESC, created_at DESC
    LIMIT 10
  `;
  return attachGameProfilePhotos(
    rows.map((r) => ({
      _id: r.email,
      nickname: r.nickname,
      score: Number(r.score),
      createdAt: normalizeToIsoString(r.createdAt)
    }))
  );
}

export async function GET(event) {
  const { url } = event;
  const session = await getGameSession(event);
  const user = session?.user;
  const email = typeof user?.email === 'string' ? user.email : '';

  if (!email) {
    throw error(401, { message: 'Login required' });
  }

  if (url.searchParams.get('rank')) {
    const [rank, myBest, todayStats] = await Promise.all([
      getRankTop10(),
      (async () => {
        const myDoc = await getPrisma().gameScoreWatermelon.findFirst({
          where: { email },
          orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
          select: { score: true, createdAt: true }
        });
        return myDoc
          ? { score: Number(myDoc.score), createdAt: normalizeToIsoString(myDoc.createdAt) }
          : null;
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

export async function POST(event) {
  const { request } = event;
  const session = await getGameSession(event);
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
    if (isLocalGameSmokeSession(session)) return json({ success: true, smoke: true });
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
  if (isLocalGameSmokeSession(session)) return json({ success: true, score, smoke: true });

  await getPrisma().gameScoreWatermelon.create({ data: { email, nickname, score } });
  return json({ success: true, score });
}

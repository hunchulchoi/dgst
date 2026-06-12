import { error, json } from '@sveltejs/kit';
import { getPrisma } from '$lib/database/prisma.js';
import { getToday2048Stats } from '$lib/server/game2048Stats.js';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * 3일 내 id(email)별 최고점 Top10. 게임오버 시점 점수만 인정(누적 아님).
 */
async function getRankTop10() {
  const since = new Date(Date.now() - THREE_DAYS_MS);
  /** @type {Array<{ email: string; nickname: string; score: number }>} */
  const rows = await getPrisma().$queryRaw`
    SELECT email, nickname, score
    FROM (
      SELECT email, nickname, score,
        ROW_NUMBER() OVER (PARTITION BY email ORDER BY score DESC) AS rn
      FROM game_score_2048
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
  if (!email) throw error(401, { message: '로그인이 필요합니다.' });

  if (url.searchParams.get('rank')) {
    const [rank, myDocResult, todayStats] = await Promise.all([
      getRankTop10(),
      (async () => {
        const since = new Date(Date.now() - THREE_DAYS_MS);
        const myDoc = await getPrisma().gameScore2048.findFirst({
          where: { email, createdAt: { gte: since } },
          orderBy: { score: 'desc' },
          select: { score: true }
        });
        return myDoc?.score ?? null;
      })(),
      getToday2048Stats()
    ]);
    return json(
      { rank, myBest: myDocResult, todayStats },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
  return json({});
}

export async function POST({ locals, request }) {
  const session = await locals.auth();
  const user = session?.user;
  const email = typeof user?.email === 'string' ? user.email : '';
  if (!email) throw error(401, { message: '로그인이 필요합니다.' });

  let body;
  try {
    body = await request.json();
  } catch {
    throw error(400, { message: 'Invalid JSON' });
  }
  const score = Number(body?.score);
  if (!Number.isFinite(score) || score < 0) {
    throw error(400, { message: '유효한 점수를 보내 주세요.' });
  }

  const nickname =
    typeof user === 'object' && 'nickname' in user && typeof user.nickname === 'string'
      ? user.nickname
      : 'anonymous';

  await getPrisma().gameScore2048.create({ data: { email, nickname, score } });
  return json({ success: true, score });
}

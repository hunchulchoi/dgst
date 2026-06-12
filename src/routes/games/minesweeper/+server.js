import { error, json } from '@sveltejs/kit';
import { getPrisma } from '$lib/database/prisma.js';
import { getTodayMinesweeperStats } from '$lib/server/gameMinesweeperStats.js';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * 3일 내 id(email)별 최고 기록 모드별 Top10. 시간(초) 기준이므로 낮을수록 좋음.
 */
async function getRankTop10(mode) {
  const since = new Date(Date.now() - THREE_DAYS_MS);
  /** @type {Array<{ email: string; nickname: string; time: number }>} */
  const rows = await getPrisma().$queryRaw`
    SELECT email, nickname, time
    FROM (
      SELECT email, nickname, time,
        ROW_NUMBER() OVER (PARTITION BY email ORDER BY time ASC) AS rn
      FROM game_score_minesweeper
      WHERE created_at >= ${since} AND mode = ${mode}
    ) t
    WHERE rn = 1
    ORDER BY time ASC
    LIMIT 10
  `;
  return rows.map((r) => ({
    _id: r.email,
    nickname: r.nickname,
    time: Number(r.time)
  }));
}

export async function GET({ locals, url }) {
  const session = await locals.auth();
  if (!session?.user?.email) throw error(401, { message: '로그인이 필요합니다.' });

  if (url.searchParams.get('rank')) {
    const mode = url.searchParams.get('mode') || 'beginner';
    const [rank, myDocResult, todayStats] = await Promise.all([
      getRankTop10(mode),
      (async () => {
        const email = session.user.email;
        const since = new Date(Date.now() - THREE_DAYS_MS);
        const myDoc = await getPrisma().gameScoreMinesweeper.findFirst({
          where: { email, createdAt: { gte: since }, mode },
          orderBy: { time: 'asc' },
          select: { time: true }
        });
        return myDoc?.time ?? null;
      })(),
      getTodayMinesweeperStats()
    ]);
    return json(
      { rank, myBest: myDocResult, todayStats, mode },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
  return json({});
}

export async function POST({ locals, request }) {
  const session = await locals.auth();
  if (!session?.user?.email) throw error(401, { message: '로그인이 필요합니다.' });

  let body;
  try {
    body = await request.json();
  } catch {
    throw error(400, { message: 'Invalid JSON' });
  }

  const time = Number(body?.time);
  const mode = String(body?.mode);

  if (
    !Number.isFinite(time) ||
    time < 0 ||
    !['beginner', 'intermediate', 'expert'].includes(mode)
  ) {
    throw error(400, { message: '유효한 모드와 점수(시간)를 보내 주세요.' });
  }

  const email = session.user.email;
  const nickname =
    typeof session.user === 'object' &&
    'nickname' in session.user &&
    typeof session.user.nickname === 'string'
      ? session.user.nickname
      : 'anonymous';

  await getPrisma().gameScoreMinesweeper.create({ data: { email, nickname, time, mode } });
  return json({ success: true, time, mode });
}

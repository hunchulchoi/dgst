import { error, json } from '@sveltejs/kit';
import { getPrisma } from '$lib/database/prisma.js';
import { getTodayMinesweeperStats } from '$lib/server/gameMinesweeperStats.js';
import { normalizeToIsoString } from '$lib/util/formatRelativeTime.js';

/**
 * 전체 기간 email별 최고 기록 모드별 Top10. 시간(초) 기준이므로 낮을수록 좋음.
 *
 * @param {string} mode
 */
async function getRankTop10(mode) {
  /** @type {Array<{ email: string; nickname: string; time: number; createdAt: Date }>} */
  const rows = await getPrisma().$queryRaw`
    SELECT email, nickname, time, created_at AS "createdAt"
    FROM (
      SELECT email, nickname, time, created_at,
        ROW_NUMBER() OVER (PARTITION BY email ORDER BY time ASC, created_at DESC) AS rn
      FROM game_score_minesweeper
      WHERE mode = ${mode}
    ) t
    WHERE rn = 1
    ORDER BY time ASC, created_at DESC
    LIMIT 10
  `;
  return rows.map((r) => ({
    _id: r.email,
    nickname: r.nickname,
    time: Number(r.time),
    createdAt: normalizeToIsoString(r.createdAt)
  }));
}

export async function GET({ locals, url }) {
  const session = await locals.auth();
  const user = session?.user;
  const email = typeof user?.email === 'string' ? user.email : '';
  if (!email) throw error(401, { message: '로그인이 필요합니다.' });

  if (url.searchParams.get('rank')) {
    const mode = url.searchParams.get('mode') || 'beginner';
    const [rank, myDocResult, todayStats] = await Promise.all([
      getRankTop10(mode),
      (async () => {
        const myDoc = await getPrisma().gameScoreMinesweeper.findFirst({
          where: { email, mode },
          orderBy: [{ time: 'asc' }, { createdAt: 'desc' }],
          select: { time: true, createdAt: true }
        });
        return myDoc
          ? { time: Number(myDoc.time), createdAt: normalizeToIsoString(myDoc.createdAt) }
          : null;
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
  const user = session?.user;
  const email = typeof user?.email === 'string' ? user.email : '';
  if (!email) throw error(401, { message: '로그인이 필요합니다.' });

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

  const nickname =
    typeof user === 'object' && 'nickname' in user && typeof user.nickname === 'string'
      ? user.nickname
      : 'anonymous';

  await getPrisma().gameScoreMinesweeper.create({ data: { email, nickname, time, mode } });
  return json({ success: true, time, mode });
}

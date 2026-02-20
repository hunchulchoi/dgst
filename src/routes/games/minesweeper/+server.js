import connectDB from '$lib/database/mongoosePriomise.js';
import { error, json } from '@sveltejs/kit';
import { GameScoreMinesweeper } from '$lib/models/gameScoreMinesweeper.js';
import { getTodayMinesweeperStats } from '$lib/server/gameMinesweeperStats.js';

connectDB();

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * 3일 내 id(email)별 최고 기록 모드별 Top10. 시간(초) 기준이므로 낮을수록 좋음.
 */
async function getRankTop10(mode) {
  const since = new Date(Date.now() - THREE_DAYS_MS);
  const rows = await GameScoreMinesweeper.aggregate([
    { $match: { createdAt: { $gte: since }, mode: mode } },
    { $sort: { time: 1 } },
    {
      $group: {
        _id: '$email',
        nickname: { $first: '$nickname' },
        time: { $min: '$time' }
      }
    },
    { $sort: { time: 1 } },
    { $limit: 10 }
  ]);
  return rows.map((r) => ({
    _id: r._id,
    nickname: r.nickname,
    time: r.time
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
        const myDoc = await GameScoreMinesweeper.findOne(
          { email, createdAt: { $gte: since }, mode },
          { sort: { time: 1 }, projection: { time: 1 } }
        ).lean();
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

  await GameScoreMinesweeper.create({ email, nickname, time, mode });
  return json({ success: true, time, mode });
}

import connectDB from '$lib/database/mongoosePriomise.js';
import { error, json } from '@sveltejs/kit';
import { GameScoreWatermelon } from '$lib/models/gameScoreWatermelon.js';
import { GameLog } from '$lib/models/gameLog.js';
import { getTodayWatermelonStats } from '$lib/server/gameWatermelonStats.js';

connectDB();

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Get Top 10 scores (highest score per user ID within last 3 days).
 */
async function getRankTop10() {
  const since = new Date(Date.now() - THREE_DAYS_MS);
  const rows = await GameScoreWatermelon.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $sort: { score: -1 } },
    {
      $group: {
        _id: '$email',
        nickname: { $first: '$nickname' },
        score: { $max: '$score' }
      }
    },
    { $sort: { score: -1 } },
    { $limit: 10 }
  ]);
  return rows.map((r) => ({
    _id: r._id,
    nickname: r.nickname,
    score: r.score
  }));
}

export async function GET({ locals, url }) {
  const session = await locals.auth();

  if (!session?.user?.email) {
    throw error(401, { message: 'Login required' });
  }

  if (url.searchParams.get('rank')) {
    const [rank, myBest, todayStats] = await Promise.all([
      getRankTop10(),
      (async () => {
        const email = session.user.email;
        const since = new Date(Date.now() - THREE_DAYS_MS);
        const myDoc = await GameScoreWatermelon.findOne(
          { email, createdAt: { $gte: since } },
          { sort: { score: -1 }, projection: { score: 1 } }
        ).lean();
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
  if (!session?.user?.email) throw error(401, { message: 'Login required' });

  let body;
  try {
    body = await request.json();
  } catch {
    throw error(400, { message: 'Invalid JSON' });
  }

  const email = session.user.email;
  const nickname =
    typeof session.user === 'object' &&
      'nickname' in session.user &&
      typeof session.user.nickname === 'string'
      ? session.user.nickname
      : 'anonymous';

  // 게임 시작 로그 기록
  if (body?.action === 'start') {
    await GameLog.create({
      game: 'watermelon',
      action: 'start',
      email: email,
      meta: { nickname }
    });
    return json({ success: true });
  }

  const score = Number(body?.score);
  if (!Number.isFinite(score) || score < 0) {
    throw error(400, { message: 'Invalid score' });
  }

  await GameScoreWatermelon.create({ email, nickname, score });
  return json({ success: true, score });
}


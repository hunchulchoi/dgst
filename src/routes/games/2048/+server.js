import connectDB from '$lib/database/mongoosePriomise.js';
import { error, json } from '@sveltejs/kit';
import { GameScore2048 } from '$lib/models/gameScore2048.js';
import { getToday2048Stats } from '$lib/server/game2048Stats.js';

connectDB();

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * 3일 내 id(email)별 최고점 Top10. 게임오버 시점 점수만 인정(누적 아님).
 */
async function getRankTop10() {
  const since = new Date(Date.now() - THREE_DAYS_MS);
  const rows = await GameScore2048.aggregate([
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
  if (!session?.user?.email) throw error(401, { message: '로그인이 필요합니다.' });

  if (url.searchParams.get('rank')) {
    const [rank, myDocResult, todayStats] = await Promise.all([
      getRankTop10(),
      (async () => {
        const email = session.user.email;
        const since = new Date(Date.now() - THREE_DAYS_MS);
        const myDoc = await GameScore2048.findOne(
          { email, createdAt: { $gte: since } },
          { sort: { score: -1 }, projection: { score: 1 } }
        ).lean();
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
  if (!session?.user?.email) throw error(401, { message: '로그인이 필요합니다.' });

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

  const email = session.user.email;
  const nickname =
    typeof session.user === 'object' &&
    'nickname' in session.user &&
    typeof session.user.nickname === 'string'
      ? session.user.nickname
      : 'anonymous';

  await GameScore2048.create({ email, nickname, score });
  return json({ success: true, score });
}

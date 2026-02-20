import connectDB from '$lib/database/mongoosePriomise.js';
import { error, json } from '@sveltejs/kit';
import { GameScoreWatermelon } from '$lib/models/gameScoreWatermelon.js';

// No separate stats file for now, keeping it simple as requested.
// If needed, we can add getTodayWatermelonStats later.

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

  // Unlike 2048, we might allow viewing rank without login?
  // But to be consistent with 2048 logic:
  if (!session?.user?.email) {
    // Return empty rank if not logged in, or error? 2048 throws 401.
    // Let's just return empty object if not logged in to be safe for public view,
    // or follow 2048 pattern strictly.
    // 2048 throws 401.
    // But maybe we want public leaderboard?
    // User said "show top 10". Usually leaderboards are public.
    // However, the 2048 code throws 401. I'll stick to 2048 pattern to avoid auth issues if the frontend expects it.
    // Wait, 2048 frontend handles "if isLoggedIn" before calling loadRank.
    // Let's stick to 2048 pattern: secure endpoint.
    throw error(401, { message: 'Login required' });
  }

  if (url.searchParams.get('rank')) {
    const [rank, myBest] = await Promise.all([
      getRankTop10(),
      (async () => {
        const email = session.user.email;
        const since = new Date(Date.now() - THREE_DAYS_MS);
        const myDoc = await GameScoreWatermelon.findOne(
          { email, createdAt: { $gte: since } },
          { sort: { score: -1 }, projection: { score: 1 } }
        ).lean();
        return myDoc?.score ?? null;
      })()
    ]);

    return json({ rank, myBest }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
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
  const score = Number(body?.score);
  if (!Number.isFinite(score) || score < 0) {
    throw error(400, { message: 'Invalid score' });
  }

  const email = session.user.email;
  const nickname =
    typeof session.user === 'object' &&
    'nickname' in session.user &&
    typeof session.user.nickname === 'string'
      ? session.user.nickname
      : 'anonymous';

  await GameScoreWatermelon.create({ email, nickname, score });
  return json({ success: true, score });
}

import { error, json } from '@sveltejs/kit';
import { getPrisma } from '$lib/database/prisma.js';
import { getToday2048Stats } from '$lib/server/game2048Stats.js';
import { normalizeToIsoString } from '$lib/util/formatRelativeTime.js';

/**
 * 전체 기간 email별 최고점 Top10. 게임오버/레벨 통과 시점 점수만 인정(누적 아님).
 */
async function getRankTop10() {
  /** @type {Array<{ email: string; nickname: string; score: number; createdAt: Date }>} */
  const rows = await getPrisma().$queryRaw`
    SELECT email, nickname, score, created_at AS "createdAt"
    FROM (
      SELECT email, nickname, score, created_at,
        ROW_NUMBER() OVER (PARTITION BY email ORDER BY score DESC, created_at DESC) AS rn
      FROM game_score_2048
    ) t
    WHERE rn = 1
    ORDER BY score DESC, created_at DESC
    LIMIT 10
  `;
  return rows.map((r) => ({
    _id: r.email,
    nickname: r.nickname,
    score: Number(r.score),
    createdAt: normalizeToIsoString(r.createdAt)
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
        const myDoc = await getPrisma().gameScore2048.findFirst({
          where: { email },
          orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
          select: { score: true, createdAt: true }
        });
        return myDoc
          ? { score: Number(myDoc.score), createdAt: normalizeToIsoString(myDoc.createdAt) }
          : null;
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

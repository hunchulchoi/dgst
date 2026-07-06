import { error, json } from '@sveltejs/kit';
import { getPrisma } from '$lib/database/prisma.js';
import { getGameSession, isLocalGameSmokeSession } from '$lib/server/localGameSmokeSession.js';
import { normalizeToIsoString } from '$lib/util/formatRelativeTime.js';
import { BILLIARDS_MODES, isActiveBilliardsMode, isValidScore } from './gameUtils';

/**
 * @param {string} mode
 * @returns {Promise<Array<{ _id: string; nickname: string; mode: string; score: number; createdAt: string }>>}
 */
async function getRankTop10(mode) {
  /** @type {Array<{ email: string; nickname: string; mode: string; score: number; createdAt: Date }>} */
  const rows = await getPrisma().$queryRaw`
    SELECT email, nickname, mode, score, created_at AS "createdAt"
    FROM (
      SELECT email, nickname, mode, score, created_at,
             ROW_NUMBER() OVER (PARTITION BY email ORDER BY score DESC, created_at DESC) AS rn
      FROM game_score_billiards
      WHERE mode = ${mode}
    ) t
    WHERE rn = 1
    ORDER BY score DESC, created_at DESC
    LIMIT 10
  `;

  return rows.map((row) => ({
    _id: row.email,
    nickname: row.nickname,
    mode: row.mode,
    score: Number(row.score),
    createdAt: normalizeToIsoString(row.createdAt)
  }));
}

export async function GET(event) {
  const { url } = event;
  const session = await getGameSession(event);
  const user = session?.user;
  const email = typeof user?.email === 'string' ? user.email : '';
  if (!email) throw error(401, { message: '로그인이 필요합니다.' });

  const mode = url.searchParams.get('mode') ?? BILLIARDS_MODES.FOUR_BALL;
  if (!isActiveBilliardsMode(mode)) throw error(400, { message: '지원하지 않는 당구 모드입니다.' });

  if (url.searchParams.get('rank')) {
    const [rank, myBest] = await Promise.all([
      getRankTop10(mode),
      (async () => {
        const myDoc = await getPrisma().gameScoreBilliards.findFirst({
          where: { email, mode },
          orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
          select: { score: true, createdAt: true }
        });

        return myDoc
          ? { score: Number(myDoc.score), createdAt: normalizeToIsoString(myDoc.createdAt) }
          : null;
      })()
    ]);

    return json({ rank, myBest, mode });
  }

  return json({ success: true, mode });
}

export async function POST(event) {
  const { request } = event;
  const session = await getGameSession(event);
  const user = session?.user;
  const email = typeof user?.email === 'string' ? user.email : '';
  const nickname = typeof user?.nickname === 'string' ? user.nickname : '';
  if (!email || !nickname) throw error(401, { message: '로그인이 필요합니다.' });

  const body = await request.json().catch(() => null);
  const mode = body?.mode ?? BILLIARDS_MODES.FOUR_BALL;
  const score = Number(body?.score);

  if (!isActiveBilliardsMode(mode)) throw error(400, { message: '지원하지 않는 당구 모드입니다.' });
  if (!isValidScore(score)) throw error(400, { message: '점수가 올바르지 않습니다.' });
  if (isLocalGameSmokeSession(session)) return json({ success: true, mode, score, smoke: true });

  await getPrisma().gameScoreBilliards.create({
    data: { email, nickname, mode, score }
  });

  return json({ success: true, mode, score });
}

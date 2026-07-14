import { error, json } from '@sveltejs/kit';
import { getPrisma } from '$lib/database/prisma.js';
import { getGameSession, isLocalGameSmokeSession } from '$lib/server/localGameSmokeSession.js';
import { getTodayBilliardsStats } from '$lib/server/gameBilliardsStats.js';
import { normalizeToIsoString } from '$lib/util/formatRelativeTime.js';
import {
  BILLIARDS_MODES,
  isBilliardsRankingMode,
  isValidScore
} from './gameUtils';

/**
 * @param {string} mode
 * @returns {Promise<Array<{ _id: string; nickname: string; mode: string; score: number; createdAt: string }>>}
 */
async function getRankTop10(mode) {
  /** @type {Array<{ email: string; nickname: string; mode: string; score: number; createdAt: Date | string }>} */
  const rows = await getPrisma().$queryRaw`
    SELECT email, nickname, mode, score, created_at AS "createdAt"
    FROM (
      SELECT email, nickname, mode, score, created_at,
             ROW_NUMBER() OVER (PARTITION BY email ORDER BY score DESC, created_at DESC) AS rn
      FROM game_score_billiards
      WHERE mode = ${mode}
         OR (${mode} = ${BILLIARDS_MODES.FOUR_BALL} AND mode LIKE 'four-ball-%')
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
  if (!isBilliardsRankingMode(mode))
    throw error(400, { message: '지원하지 않는 당구 모드입니다.' });

  if (url.searchParams.get('rank')) {
    const [rank, myBest, todayStats] = await Promise.all([
      getRankTop10(mode),
      (async () => {
        /** @type {Array<{ score: number; createdAt: Date | string }>} */
        const rows = await getPrisma().$queryRaw`
          SELECT score, created_at AS "createdAt"
          FROM game_score_billiards
          WHERE email = ${email}
            AND (mode = ${mode}
              OR (${mode} = ${BILLIARDS_MODES.FOUR_BALL} AND mode LIKE 'four-ball-%'))
          ORDER BY score DESC, created_at DESC
          LIMIT 1
        `;
        const myDoc = rows[0];

        return myDoc
          ? { score: Number(myDoc.score), createdAt: normalizeToIsoString(myDoc.createdAt) }
          : null;
      })(),
      getTodayBilliardsStats(mode)
    ]);

    return json({ rank, myBest, todayStats, mode });
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

  if (!isBilliardsRankingMode(mode))
    throw error(400, { message: '지원하지 않는 당구 모드입니다.' });
  if (!isValidScore(score)) throw error(400, { message: '점수가 올바르지 않습니다.' });
  if (isLocalGameSmokeSession(session)) return json({ success: true, mode, score, smoke: true });

  await getPrisma().gameScoreBilliards.create({
    data: { email, nickname, mode, score }
  });

  return json({ success: true, mode, score });
}

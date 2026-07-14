import { error, json } from '@sveltejs/kit';
import { getPrisma } from '$lib/database/prisma.js';
import { getGameSession, isLocalGameSmokeSession } from '$lib/server/localGameSmokeSession.js';
import { getTodayBilliardsStats } from '$lib/server/gameBilliardsStats.js';
import { normalizeToIsoString } from '$lib/util/formatRelativeTime.js';
import {
  BILLIARDS_MODES,
  FOUR_BALL_TARGET_OPTIONS,
  FOUR_BALL_TARGET_SCORE,
  isActiveBilliardsMode,
  isValidScore
} from './gameUtils';

/** @param {unknown} value @returns {number | null} */
function getFourBallTarget(value) {
  const target = Number(value ?? FOUR_BALL_TARGET_SCORE);
  return FOUR_BALL_TARGET_OPTIONS.some((option) => option === target) ? target : null;
}

/** @param {string} mode @param {number | null} target */
function getRankingMode(mode, target) {
  return mode === BILLIARDS_MODES.FOUR_BALL ? `${mode}-${target}` : mode;
}

/**
 * @param {string} mode
 * @returns {Promise<Array<{ _id: string; nickname: string; mode: string; score: number; createdAt: string }>>}
 */
async function getRankTop10(mode) {
  /** @type {Array<{ email: string; nickname: string; mode: string; score: number; createdAt: Date | string }>} */
  const rows = await getPrisma().$queryRaw`
    SELECT email, nickname, mode, score,
           to_char(
             ((created_at AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'UTC'),
             'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
           ) AS "createdAt"
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
  const target = mode === BILLIARDS_MODES.FOUR_BALL
    ? getFourBallTarget(url.searchParams.get('target'))
    : null;
  if (mode === BILLIARDS_MODES.FOUR_BALL && target === null) {
    throw error(400, { message: '목표 점수가 올바르지 않습니다.' });
  }
  const rankingMode = getRankingMode(mode, target);

  if (url.searchParams.get('rank')) {
    const [rank, myBest, todayStats] = await Promise.all([
      getRankTop10(rankingMode),
      (async () => {
        /** @type {Array<{ score: number; createdAt: Date | string }>} */
        const rows = await getPrisma().$queryRaw`
          SELECT score,
                 to_char(
                   ((created_at AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'UTC'),
                   'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                 ) AS "createdAt"
          FROM game_score_billiards
          WHERE email = ${email} AND mode = ${rankingMode}
          ORDER BY score DESC, created_at DESC
          LIMIT 1
        `;
        const myDoc = rows[0];

        return myDoc
          ? { score: Number(myDoc.score), createdAt: normalizeToIsoString(myDoc.createdAt) }
          : null;
      })(),
      getTodayBilliardsStats(rankingMode)
    ]);

    return json({ rank, myBest, todayStats, mode, target });
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
  const target = mode === BILLIARDS_MODES.FOUR_BALL ? getFourBallTarget(body?.target) : null;
  if (mode === BILLIARDS_MODES.FOUR_BALL && target === null) {
    throw error(400, { message: '목표 점수가 올바르지 않습니다.' });
  }
  if (!isValidScore(score)) throw error(400, { message: '점수가 올바르지 않습니다.' });
  if (isLocalGameSmokeSession(session)) return json({ success: true, mode, target, score, smoke: true });

  const rankingMode = getRankingMode(mode, target);

  await getPrisma().gameScoreBilliards.create({
    data: { email, nickname, mode: rankingMode, score }
  });

  return json({ success: true, mode, target, score });
}

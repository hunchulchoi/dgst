import { randomUUID } from 'crypto';
import { error, json } from '@sveltejs/kit';
import { getPrisma } from '$lib/database/prisma.js';
import { getGameSession, isLocalGameSmokeSession } from '$lib/server/localGameSmokeSession.js';
import { getTodaySudokuStats } from '$lib/server/gameSudokuStats.js';
import { normalizeToIsoString } from '$lib/util/formatRelativeTime.js';

const DIFFICULTIES = new Set(['easy', 'normal', 'hard']);
const MAX_SECONDS = 24 * 60 * 60;
const MAX_MISTAKES = 999;

/**
 * @param {string} difficulty
 * @returns {Promise<Array<{ _id: string; nickname: string; difficulty: string; seconds: number; mistakes: number; createdAt: string }>>}
 */
async function getRankTop10(difficulty) {
  /** @type {Array<{ email: string; nickname: string; difficulty: string; seconds: number; mistakes: number; createdAt: Date | string }>} */
  const rows = await getPrisma().$queryRaw`
    SELECT email, nickname, difficulty, seconds, mistakes,
           to_char(
             ((created_at AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'UTC'),
             'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
           ) AS "createdAt"
    FROM (
      SELECT email, nickname, difficulty, seconds, mistakes, created_at,
             ROW_NUMBER() OVER (
               PARTITION BY email
               ORDER BY seconds ASC, mistakes ASC, created_at DESC
             ) AS rn
      FROM game_score_sudoku
      WHERE difficulty = ${difficulty}
    ) t
    WHERE rn = 1
    ORDER BY seconds ASC, mistakes ASC, created_at DESC
    LIMIT 10
  `;

  return rows.map((row) => ({
    _id: row.email,
    nickname: row.nickname,
    difficulty: row.difficulty,
    seconds: Number(row.seconds),
    mistakes: Number(row.mistakes),
    createdAt: normalizeToIsoString(row.createdAt)
  }));
}

/**
 * @param {unknown} value
 * @returns {'easy' | 'normal' | 'hard'}
 */
function normalizeDifficulty(value) {
  if (typeof value === 'string' && DIFFICULTIES.has(value)) {
    return /** @type {'easy' | 'normal' | 'hard'} */ (value);
  }
  return 'normal';
}

export async function GET(event) {
  const { url } = event;
  const session = await getGameSession(event);
  const user = session?.user;
  const email = typeof user?.email === 'string' ? user.email : '';
  if (!email) throw error(401, { message: '로그인이 필요합니다.' });

  const difficulty = normalizeDifficulty(url.searchParams.get('difficulty') ?? 'normal');

  if (url.searchParams.get('rank')) {
    const [rank, myBest, todayStats] = await Promise.all([
      getRankTop10(difficulty),
      (async () => {
        /** @type {Array<{ seconds: number; mistakes: number; createdAt: Date | string }>} */
        const rows = await getPrisma().$queryRaw`
          SELECT seconds, mistakes,
                 to_char(
                   ((created_at AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'UTC'),
                   'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                 ) AS "createdAt"
          FROM game_score_sudoku
          WHERE email = ${email} AND difficulty = ${difficulty}
          ORDER BY seconds ASC, mistakes ASC, created_at DESC
          LIMIT 1
        `;
        const row = rows[0];
        return row
          ? {
              seconds: Number(row.seconds),
              mistakes: Number(row.mistakes),
              createdAt: normalizeToIsoString(row.createdAt)
            }
          : null;
      })(),
      getTodaySudokuStats(difficulty)
    ]);

    return json(
      { rank, myBest, todayStats, difficulty },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  return json({ success: true, difficulty });
}

export async function POST(event) {
  const { request } = event;
  const session = await getGameSession(event);
  const user = session?.user;
  const email = typeof user?.email === 'string' ? user.email : '';
  if (!email) throw error(401, { message: '로그인이 필요합니다.' });

  const body = await request.json().catch(() => null);
  const difficulty = normalizeDifficulty(body?.difficulty ?? 'normal');
  const seconds = Number(body?.seconds);
  const mistakes = Number(body?.mistakes ?? 0);

  if (!Number.isInteger(seconds) || seconds < 1 || seconds > MAX_SECONDS) {
    throw error(400, { message: '유효한 기록을 보내 주세요.' });
  }

  if (!Number.isInteger(mistakes) || mistakes < 0 || mistakes > MAX_MISTAKES) {
    throw error(400, { message: '유효한 실수 횟수를 보내 주세요.' });
  }
  if (isLocalGameSmokeSession(session)) {
    return json({ success: true, difficulty, seconds, mistakes, smoke: true });
  }

  const nickname =
    typeof user === 'object' && 'nickname' in user && typeof user.nickname === 'string'
      ? user.nickname
      : 'anonymous';

  await getPrisma().$executeRaw`
    INSERT INTO game_score_sudoku (id, email, nickname, difficulty, seconds, mistakes)
    VALUES (${randomUUID()}, ${email}, ${nickname}, ${difficulty}, ${seconds}, ${mistakes})
  `;

  return json({ success: true, difficulty, seconds, mistakes });
}

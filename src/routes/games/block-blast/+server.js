import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { getPrisma } from '$lib/database/prisma.js';
import { attachGameProfilePhotos } from '$lib/server/gameProfilePhotos.js';
import { getGameSession, isLocalGameSmokeSession } from '$lib/server/localGameSmokeSession.js';
import { normalizeToIsoString } from '$lib/util/formatRelativeTime.js';

const GAME = 'block-blast';
const scoreSchema = z.object({ score: z.number().int().min(1).max(2_147_483_647) });

/** @param {import('./$types').RequestEvent} event */
export async function GET(event) {
  const session = await getGameSession(event);
  const email = session?.user?.email;
  if (!email) throw error(401, '로그인이 필요합니다.');
  const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
  if (isLocalGameSmokeSession(session)) {
    return json({ rank: [], myBest: null, smoke: true }, { headers });
  }

  const [rankRows, bestRows] = await Promise.all([
    getPrisma().$queryRaw`
      SELECT email, nickname, score, created_at AS "createdAt"
      FROM (
        SELECT DISTINCT ON (email) email,
          COALESCE(meta->>'nickname', 'anonymous') AS nickname,
          (meta->>'score')::int AS score, created_at
        FROM game_logs
        WHERE game = ${GAME} AND action = 'score'
          AND email IS NOT NULL AND meta->>'score' IS NOT NULL
        ORDER BY email, (meta->>'score')::int DESC, created_at DESC
      ) best
      ORDER BY score DESC, created_at DESC, email ASC
      LIMIT 10
    `,
    getPrisma().$queryRaw`
      SELECT (meta->>'score')::int AS score, created_at AS "createdAt"
      FROM game_logs
      WHERE game = ${GAME} AND action = 'score' AND email = ${email}
        AND meta->>'score' IS NOT NULL
      ORDER BY (meta->>'score')::int DESC, created_at DESC
      LIMIT 1
    `
  ]);
  const rows =
    /** @type {Array<{email: string; nickname: string; score: number; createdAt: Date}>} */ (
      rankRows
    );
  const mine = /** @type {Array<{score: number; createdAt: Date}>} */ (bestRows);
  const rank = await attachGameProfilePhotos(
    rows.map((r) => ({
      _id: r.email,
      nickname: r.nickname,
      score: Number(r.score),
      createdAt: normalizeToIsoString(r.createdAt)
    }))
  );
  const myBest = mine.length
    ? {
        score: Number(mine[0].score),
        createdAt: normalizeToIsoString(mine[0].createdAt)
      }
    : null;
  return json({ rank, myBest }, { headers });
}

/** @param {import('./$types').RequestEvent} event */
export async function POST(event) {
  const session = await getGameSession(event);
  const user = session?.user;
  const email = user?.email;
  if (!email) throw error(401, '로그인이 필요합니다.');
  let body;
  try {
    body = await event.request.json();
  } catch {
    throw error(400, '유효한 JSON을 보내 주세요.');
  }
  const parsed = scoreSchema.safeParse(body);
  if (!parsed.success) throw error(400, '유효한 점수를 보내 주세요.');
  const { score } = parsed.data;
  if (isLocalGameSmokeSession(session)) return json({ success: true, score, smoke: true });
  const nickname =
    user && 'nickname' in user && typeof user.nickname === 'string'
      ? user.nickname
      : (user?.name ?? 'anonymous');
  await getPrisma().gameLog.create({
    data: { game: GAME, action: 'score', email, meta: { nickname, score } }
  });
  return json({ success: true, score });
}

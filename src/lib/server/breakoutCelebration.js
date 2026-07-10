import { getPrisma } from '$lib/database/prisma.js';
import { normalizeToIsoString } from '$lib/util/formatRelativeTime.js';

const BREAKOUT_GAME = 'breakout';
/** 50단계 클리어 폭죽 유지 시간 */
export const BREAKOUT_CLEAR_FIREWORKS_MS = 12 * 60 * 60 * 1000;

/**
 * 최근 50단계 전체 클리어(win) 기록 — 12시간 내면 active.
 * @returns {Promise<{ active: boolean; clearedAt: string | null; until: string | null; nickname: string | null }>}
 */
export async function getBreakoutStage50Celebration() {
  try {
    /** @type {Array<{ nickname: string; createdAt: Date }>} */
    const rows = await getPrisma().$queryRaw`
      SELECT
        COALESCE(meta->>'nickname', 'anonymous') AS nickname,
        created_at AS "createdAt"
      FROM game_logs
      WHERE game = ${BREAKOUT_GAME}
        AND action = 'score'
        AND COALESCE((meta->>'stage')::int, 0) = 50
        AND (meta->>'win') = 'true'
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (!rows.length) {
      return { active: false, clearedAt: null, until: null, nickname: null };
    }

    const clearedAtMs = new Date(rows[0].createdAt).getTime();
    const untilMs = clearedAtMs + BREAKOUT_CLEAR_FIREWORKS_MS;
    const active = Date.now() < untilMs;

    return {
      active,
      clearedAt: normalizeToIsoString(rows[0].createdAt),
      until: new Date(untilMs).toISOString(),
      nickname: rows[0].nickname || 'anonymous'
    };
  } catch (err) {
    console.error('[breakout celebration query failed]', err);
    return { active: false, clearedAt: null, until: null, nickname: null };
  }
}

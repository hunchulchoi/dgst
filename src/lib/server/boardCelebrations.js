import { getPrisma } from '$lib/database/prisma.js';
import { normalizeToIsoString } from '$lib/util/formatRelativeTime.js';
import { getBreakoutStage50Celebration } from '$lib/server/breakoutCelebration.js';

/** 폭죽 유지 시간 (1등 교체·50클리어 공통) */
export const BOARD_CELEBRATION_MS = 12 * 60 * 60 * 1000;
/** @type {Record<string, string>} */
const FORCED_CELEBRATION_IDS = {
  'sudoku:hard': '2026-07-13-hard-rank1-replay'
};

/** 현재 짤짤이 1등 임시 축하. 12시간 뒤 자동 종료. */
const SSAMCHI_RANK1_BOOTSTRAP_AT = new Date('2026-07-18T13:40:00.000Z');

/**
 * @typedef {{
 *   id: string;
 *   kind: 'breakout50' | 'rank1';
 *   game: string;
 *   label: string;
 *   nickname: string;
 *   detail: string;
 *   at: string;
 *   until: string;
 * }} BoardCelebration
 */

/**
 * @param {Date | string} createdAt
 * @param {number} [windowMs]
 */
function withinWindow(createdAt, windowMs = BOARD_CELEBRATION_MS) {
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < windowMs && Date.now() >= t;
}

/**
 * @param {Date | string} createdAt
 * @param {number} [windowMs]
 */
function untilIso(createdAt, windowMs = BOARD_CELEBRATION_MS) {
  return new Date(new Date(createdAt).getTime() + windowMs).toISOString();
}

/**
 * game_logs 점수형 게임 1등 (breakout / tetris)
 * @param {string} game
 * @param {string} label
 * @returns {Promise<BoardCelebration | null>}
 */
async function rank1FromGameLogs(game, label) {
  /** @type {Array<{ nickname: string; score: number; createdAt: Date }>} */
  const rows = await getPrisma().$queryRaw`
    SELECT nickname, score, created_at AS "createdAt"
    FROM (
      SELECT
        COALESCE(meta->>'nickname', 'anonymous') AS nickname,
        (meta->>'score')::int AS score,
        created_at,
        ROW_NUMBER() OVER (
          PARTITION BY email
          ORDER BY (meta->>'score')::int DESC, created_at DESC
        ) AS rn
      FROM game_logs
      WHERE game = ${game}
        AND action = 'score'
        AND email IS NOT NULL
        AND meta->>'score' IS NOT NULL
    ) t
    WHERE rn = 1
    ORDER BY score DESC, created_at DESC
    LIMIT 1
  `;
  if (!rows.length || !withinWindow(rows[0].createdAt)) return null;
  const at = normalizeToIsoString(rows[0].createdAt);
  if (!at) return null;
  return {
    id: `rank1:${game}:${at}`,
    kind: 'rank1',
    game,
    label,
    nickname: rows[0].nickname || 'anonymous',
    detail: `${Number(rows[0].score).toLocaleString()}점`,
    at,
    until: untilIso(rows[0].createdAt)
  };
}

/**
 * 점수 DESC 테이블 1등
 * @param {'game_score_2048' | 'game_score_watermelon'} table
 * @param {string} game
 * @param {string} label
 */
async function rank1FromScoreTable(table, game, label) {
  const sql =
    table === 'game_score_2048'
      ? await getPrisma().$queryRaw`
          SELECT nickname, score, created_at AS "createdAt"
          FROM (
            SELECT email, nickname, score, created_at,
              ROW_NUMBER() OVER (PARTITION BY email ORDER BY score DESC, created_at DESC) AS rn
            FROM game_score_2048
          ) t
          WHERE rn = 1
          ORDER BY score DESC, created_at DESC
          LIMIT 1
        `
      : await getPrisma().$queryRaw`
          SELECT nickname, score, created_at AS "createdAt"
          FROM (
            SELECT email, nickname, score, created_at,
              ROW_NUMBER() OVER (PARTITION BY email ORDER BY score DESC, created_at DESC) AS rn
            FROM game_score_watermelon
          ) t
          WHERE rn = 1
          ORDER BY score DESC, created_at DESC
          LIMIT 1
        `;

  /** @type {Array<{ nickname: string; score: number; createdAt: Date }>} */
  const rows = /** @type {any} */ (sql);
  if (!rows.length || !withinWindow(rows[0].createdAt)) return null;
  const at = normalizeToIsoString(rows[0].createdAt);
  if (!at) return null;
  return {
    id: `rank1:${game}:${at}`,
    kind: 'rank1',
    game,
    label,
    nickname: rows[0].nickname || 'anonymous',
    detail: `${Number(rows[0].score).toLocaleString()}점`,
    at,
    until: untilIso(rows[0].createdAt)
  };
}

/**
 * 지뢰찾기 — 모드별 최근 1등 기록
 * @returns {Promise<BoardCelebration[]>}
 */
export async function rank1Minesweeper() {
  /** @type {Array<{ nickname: string; time: number; mode: string; createdAt: Date }>} */
  const rows = await getPrisma().$queryRaw`
    SELECT nickname, time, mode, created_at AS "createdAt"
    FROM (
      SELECT email, nickname, time, mode, created_at,
        ROW_NUMBER() OVER (
          PARTITION BY mode, email
          ORDER BY time ASC, created_at DESC
        ) AS rn
      FROM game_score_minesweeper
    ) per_user
    WHERE rn = 1
    ORDER BY time ASC, created_at DESC
  `;
  // 모드별 1등 중 createdAt이 가장 최근인 것
  /** @type {Map<string, { nickname: string; time: number; mode: string; createdAt: Date }>} */
  const modeTop = new Map();
  for (const r of rows) {
    if (!modeTop.has(r.mode)) modeTop.set(r.mode, r);
  }
  /** @type {BoardCelebration[]} */
  const celebrations = [];
  for (const r of modeTop.values()) {
    if (!withinWindow(r.createdAt)) continue;
    const at = normalizeToIsoString(r.createdAt);
    if (!at) continue;
    celebrations.push({
      id: `rank1:minesweeper:${r.mode}:${at}`,
      kind: 'rank1',
      game: 'minesweeper',
      label: '지뢰찾기 1등',
      nickname: r.nickname || 'anonymous',
      detail: `${r.mode} · ${Number(r.time)}초`,
      at,
      until: untilIso(r.createdAt)
    });
  }
  return celebrations;
}

/** 당구 — 모드 중 최근 1등 */
async function rank1Billiards() {
  /** @type {Array<{ nickname: string; score: number; mode: string; createdAt: Date }>} */
  const rows = await getPrisma().$queryRaw`
    SELECT nickname, score, mode, created_at AS "createdAt"
    FROM (
      SELECT email, nickname, score, mode, created_at,
        ROW_NUMBER() OVER (
          PARTITION BY mode, email
          ORDER BY score DESC, created_at DESC
        ) AS rn
      FROM game_score_billiards
    ) per_user
    WHERE rn = 1
    ORDER BY score DESC, created_at DESC
  `;
  /** @type {Map<string, { nickname: string; score: number; mode: string; createdAt: Date }>} */
  const modeTop = new Map();
  for (const r of rows) {
    if (!modeTop.has(r.mode)) modeTop.set(r.mode, r);
  }
  let best = null;
  for (const r of modeTop.values()) {
    if (!withinWindow(r.createdAt)) continue;
    if (!best || new Date(r.createdAt) > new Date(best.createdAt)) best = r;
  }
  if (!best) return null;
  const at = normalizeToIsoString(best.createdAt);
  if (!at) return null;
  return {
    id: `rank1:billiards:${best.mode}:${at}`,
    kind: 'rank1',
    game: 'billiards',
    label: '당구 1등',
    nickname: best.nickname || 'anonymous',
    detail: `${best.mode} · ${Number(best.score).toLocaleString()}점`,
    at,
    until: untilIso(best.createdAt)
  };
}

/**
 * 스도쿠 — 난이도별 최근 1등
 * @returns {Promise<BoardCelebration[]>}
 */
export async function rank1Sudoku() {
  /** @type {Array<{ nickname: string; seconds: number; mistakes: number; difficulty: string; createdAt: Date }>} */
  const rows = await getPrisma().$queryRaw`
    SELECT nickname, seconds, mistakes, difficulty, created_at AS "createdAt"
    FROM (
      SELECT email, nickname, seconds, mistakes, difficulty, created_at,
        ROW_NUMBER() OVER (
          PARTITION BY difficulty, email
          ORDER BY seconds ASC, mistakes ASC, created_at DESC
        ) AS rn
      FROM game_score_sudoku
    ) per_user
    WHERE rn = 1
    ORDER BY seconds ASC, mistakes ASC, created_at DESC
  `;
  /** @type {Map<string, typeof rows[0]>} */
  const diffTop = new Map();
  for (const r of rows) {
    if (!diffTop.has(r.difficulty)) diffTop.set(r.difficulty, r);
  }
  /** @type {BoardCelebration[]} */
  const celebrations = [];
  for (const r of diffTop.values()) {
    if (!withinWindow(r.createdAt)) continue;
    const at = normalizeToIsoString(r.createdAt);
    if (!at) continue;
    const forcedId = FORCED_CELEBRATION_IDS[`sudoku:${r.difficulty}`];
    celebrations.push({
      id: `rank1:sudoku:${r.difficulty}:${at}${forcedId ? `:${forcedId}` : ''}`,
      kind: 'rank1',
      game: 'sudoku',
      label: '스도쿠 1등',
      nickname: r.nickname || 'anonymous',
      detail: `${r.difficulty} · ${Number(r.seconds)}초`,
      at,
      until: untilIso(r.createdAt)
    });
  }
  return celebrations;
}

/**
 * @param {{ nickname: string; balance: number; email: string }} row
 * @param {Date | string} createdAt
 * @param {string} id
 * @returns {BoardCelebration | null}
 */
function seotdaRank1Celebration(row, createdAt, id) {
  const at = normalizeToIsoString(createdAt);
  if (!at) return null;
  return {
    id,
    kind: 'rank1',
    game: 'seotda',
    label: '섯다 1등',
    nickname: row.nickname || 'anonymous',
    detail: `${Number(row.balance).toLocaleString()}점`,
    at,
    until: untilIso(createdAt)
  };
}

/**
 * 섯다 — reels에 lead 마킹된 최근 1등 탈환 (판 정산 시점에 기록)
 * @returns {Promise<BoardCelebration | null>}
 */
async function rank1Seotda() {
  /** @type {Array<{ nickname: string; balance: number; createdAt: Date; email: string }>} */
  const rows = await getPrisma().$queryRaw`
    SELECT
      nickname,
      balance,
      created_at AS "createdAt",
      email
    FROM game_scores
    WHERE game IN ('seotda', 'seotda-leader')
      AND 'lead' = ANY(reels)
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (rows.length && withinWindow(rows[0].createdAt)) {
    const at = normalizeToIsoString(rows[0].createdAt);
    if (!at) return null;
    return seotdaRank1Celebration(
      rows[0],
      rows[0].createdAt,
      `rank1:seotda:${rows[0].email}:${at}`
    );
  }

  return null;
}

/**
 * 짤짤이 현재 1등 임시 폭죽.
 * @returns {Promise<BoardCelebration | null>}
 */
export async function rank1SsamchiBootstrap() {
  if (!withinWindow(SSAMCHI_RANK1_BOOTSTRAP_AT)) return null;
  /** @type {Array<{ email: string; nickname: string; balance: number }>} */
  const rows = await getPrisma().$queryRaw`
    SELECT email, nickname, balance
    FROM (
      SELECT email, nickname, balance,
        ROW_NUMBER() OVER (PARTITION BY email ORDER BY created_at DESC) AS rn,
        created_at
      FROM game_scores
      WHERE game = 'ssamchi'
    ) latest
    WHERE rn = 1
    ORDER BY balance DESC, created_at DESC
    LIMIT 1
  `;
  const leader = rows[0];
  if (!leader) return null;
  const at = SSAMCHI_RANK1_BOOTSTRAP_AT.toISOString();
  return {
    id: `rank1:ssamchi:bootstrap-20260718:${leader.email}`,
    kind: 'rank1',
    game: 'ssamchi',
    label: '짤짤이 1등',
    nickname: leader.nickname || 'anonymous',
    detail: `${Number(leader.balance).toLocaleString()}개`,
    at,
    until: untilIso(SSAMCHI_RANK1_BOOTSTRAP_AT)
  };
}

/** 슬롯은 updatedAt이 매 스핀마다 갱신되어 제외 */

/**
 * 자유게시판용 활성 축하 이벤트 목록 (12시간 내).
 * @returns {Promise<BoardCelebration[]>}
 */
export async function getBoardCelebrations() {
  /** @type {BoardCelebration[]} */
  const out = [];

  try {
    const stage50 = await getBreakoutStage50Celebration();
    if (stage50.active && stage50.clearedAt) {
      out.push({
        id: `breakout50:${stage50.clearedAt}`,
        kind: 'breakout50',
        game: 'breakout',
        label: '블록깨기 50단계 클리어',
        nickname: stage50.nickname || 'anonymous',
        detail: '전체 클리어',
        at: stage50.clearedAt,
        until: stage50.until || untilIso(stage50.clearedAt)
      });
    }
  } catch (err) {
    console.error('[celebration breakout50]', err);
  }

  const tasks = [
    rank1FromGameLogs('breakout', '블록깨기 1등'),
    rank1FromGameLogs('tetris', '테트리스 1등'),
    rank1FromScoreTable('game_score_2048', '2048', '2048 1등'),
    rank1FromScoreTable('game_score_watermelon', 'watermelon', '수박게임 1등'),
    rank1Minesweeper(),
    rank1Billiards(),
    rank1Sudoku(),
    rank1Seotda(),
    rank1SsamchiBootstrap()
  ];

  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      out.push(.../** @type {BoardCelebration[]} */ (r.value));
    } else if (r.status === 'fulfilled' && r.value) {
      out.push(/** @type {BoardCelebration} */ (r.value));
    } else if (r.status === 'rejected') {
      console.error('[celebration rank1]', r.reason);
    }
  }

  // 최신순
  out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return out;
}

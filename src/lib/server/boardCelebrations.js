import { getPrisma } from '$lib/database/prisma.js';
import { normalizeToIsoString } from '$lib/util/formatRelativeTime.js';
import { getBreakoutStage50Celebration } from '$lib/server/breakoutCelebration.js';

/** 폭죽 유지 시간 (1등 교체·50클리어 공통) */
export const BOARD_CELEBRATION_MS = 12 * 60 * 60 * 1000;

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

/** 지뢰찾기 — 모드 중 가장 최근 1등 기록 */
async function rank1Minesweeper() {
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
  let best = null;
  for (const r of modeTop.values()) {
    if (!withinWindow(r.createdAt)) continue;
    if (!best || new Date(r.createdAt) > new Date(best.createdAt)) best = r;
  }
  if (!best) return null;
  const at = normalizeToIsoString(best.createdAt);
  if (!at) return null;
  return {
    id: `rank1:minesweeper:${best.mode}:${at}`,
    kind: 'rank1',
    game: 'minesweeper',
    label: '지뢰찾기 1등',
    nickname: best.nickname || 'anonymous',
    detail: `${best.mode} · ${Number(best.time)}초`,
    at,
    until: untilIso(best.createdAt)
  };
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

/** 스도쿠 — 난이도 중 최근 1등 */
async function rank1Sudoku() {
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
  let best = null;
  for (const r of diffTop.values()) {
    if (!withinWindow(r.createdAt)) continue;
    if (!best || new Date(r.createdAt) > new Date(best.createdAt)) best = r;
  }
  if (!best) return null;
  const at = normalizeToIsoString(best.createdAt);
  if (!at) return null;
  return {
    id: `rank1:sudoku:${best.difficulty}:${at}`,
    kind: 'rank1',
    game: 'sudoku',
    label: '스도쿠 1등',
    nickname: best.nickname || 'anonymous',
    detail: `${best.difficulty} · ${Number(best.seconds)}초`,
    at,
    until: untilIso(best.createdAt)
  };
}

/**
 * 섯다 — 잔고 1등 "탈환" 시에만 (이미 1등이 또 이기면 제외, 슬롯식 스팸 방지)
 * @returns {Promise<BoardCelebration | null>}
 */
async function rank1Seotda() {
  /** @type {Array<{
   *   email: string;
   *   nickname: string;
   *   balance: number;
   *   createdAt: Date;
   *   prevBalance: number | null;
   *   maxOther: number;
   * }>} */
  const rows = await getPrisma().$queryRaw`
    WITH latest AS (
      SELECT
        email,
        nickname,
        balance::int AS balance,
        created_at,
        ROW_NUMBER() OVER (PARTITION BY email ORDER BY created_at DESC) AS rn
      FROM game_scores
      WHERE game = 'seotda'
    ),
    standing AS (
      SELECT email, nickname, balance, created_at
      FROM latest
      WHERE rn = 1 AND balance > 0
    ),
    top1 AS (
      SELECT email, nickname, balance, created_at
      FROM standing
      ORDER BY balance DESC, created_at DESC
      LIMIT 1
    ),
    prev AS (
      SELECT l.balance AS prev_balance
      FROM latest l
      INNER JOIN top1 t ON l.email = t.email AND l.rn = 2
    ),
    others AS (
      SELECT COALESCE(MAX(s.balance), 0)::int AS max_other
      FROM standing s
      INNER JOIN top1 t ON s.email <> t.email
    )
    SELECT
      t.email,
      t.nickname,
      t.balance,
      t.created_at AS "createdAt",
      p.prev_balance AS "prevBalance",
      o.max_other AS "maxOther"
    FROM top1 t
    CROSS JOIN others o
    LEFT JOIN prev p ON TRUE
  `;
  if (!rows.length) return null;
  const top = rows[0];
  if (!withinWindow(top.createdAt)) return null;

  const balance = Number(top.balance);
  const maxOther = Number(top.maxOther ?? 0);
  const prevBalance = top.prevBalance == null ? null : Number(top.prevBalance);
  // 이번 기록으로 1등 탈환: 지금 1등이고, 직전 잔고로는 1등이 아니었음
  const isNewLead = balance > maxOther && (prevBalance == null || prevBalance <= maxOther);
  if (!isNewLead) return null;

  const at = normalizeToIsoString(top.createdAt);
  if (!at) return null;
  return {
    id: `rank1:seotda:${at}`,
    kind: 'rank1',
    game: 'seotda',
    label: '섯다 1등',
    nickname: top.nickname || 'anonymous',
    detail: `${balance.toLocaleString()}점`,
    at,
    until: untilIso(top.createdAt)
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
    rank1Seotda()
  ];

  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) out.push(r.value);
    else if (r.status === 'rejected') {
      console.error('[celebration rank1]', r.reason);
    }
  }

  // 최신순
  out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return out;
}

import { getPrisma } from '$lib/database/prisma.js';
import { currentSeoulWeekSunSatRangeUtc } from '$lib/server/lottoOfficial.js';

export const LOTTO_HISTORY_MS = 24 * 60 * 60 * 1000;
export const LOTTO_HISTORY_LIMIT = 300;

/**
 * 세션 이메일과 DB의 이메일 비교 시 대소문자·공백 차이 무시
 *
 * @param {unknown} email
 */
export function normalizeLottoEmail(email) {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/** @param {unknown} numbers */
export function isValidLottoNumbers(numbers) {
  if (!Array.isArray(numbers) || numbers.length !== 6) return false;
  const set = new Set();
  for (const n of numbers) {
    if (!Number.isInteger(n) || n < 1 || n > 45) return false;
    set.add(n);
  }
  return set.size === 6;
}

/**
 * @param {unknown} value
 * @returns {value is { nickname?: unknown, numbers?: unknown }}
 */
function isLottoPickMeta(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/** @returns {number[]} ascending unique 6 from 1..45 */
export function generateLottoNumbers() {
  const pool = Array.from({ length: 45 }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = pool[i];
    pool[i] = pool[j];
    pool[j] = t;
  }
  return pool.slice(0, 6).sort((a, b) => a - b);
}

/**
 * @param {{ id: unknown, email?: unknown, createdAt: unknown, meta?: unknown }} log
 * @param {string} viewerNorm
 */
function draftFromLottoLog(log, viewerNorm) {
  const meta = isLottoPickMeta(log.meta) ? log.meta : null;
  const nickname =
    typeof meta?.nickname === 'string' && meta.nickname.trim() ? meta.nickname.trim() : null;
  const raw = meta?.numbers;
  if (!nickname || !isValidLottoNumbers(raw)) return null;

  const pickEmailNorm = normalizeLottoEmail(typeof log.email === 'string' ? log.email : '');
  const mine = viewerNorm !== '' && pickEmailNorm !== '' && pickEmailNorm === viewerNorm;

  return {
    id: String(log.id),
    nickname,
    numbers: [.../** @type {number[]} */ (raw)].sort((a, b) => a - b),
    createdAt: new Date(
      /** @type {string | number | Date} */ (log.createdAt)
    ).toISOString(),
    mine,
    pickEmailNorm
  };
}

/**
 * 로그인 사용자 본인 뽑기 — 서울 기준 이번 주(일~토), 24시간 초과분 포함
 *
 * @param {string} viewerNorm
 */
async function fetchMyLottoPicksCurrentWeek(viewerNorm) {
  const { weekStartUtc, weekEndUtc } = currentSeoulWeekSunSatRangeUtc();
  const since24h = new Date(Date.now() - LOTTO_HISTORY_MS);

  try {
    const logs = await getPrisma().gameLog.findMany({
      where: {
        game: 'lotto',
        action: 'pick',
        createdAt: {
          gte: new Date(weekStartUtc),
          lte: new Date(weekEndUtc),
          lt: since24h
        }
      },
      orderBy: { createdAt: 'desc' },
      take: LOTTO_HISTORY_LIMIT
    });

    /** @type {Array<NonNullable<ReturnType<typeof draftFromLottoLog>>>} */
    const out = [];
    for (const log of logs) {
      const d = draftFromLottoLog(log, viewerNorm);
      if (d?.mine) out.push(d);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * 마지막 24시간 로또 기록 목록 (최신순).
 * 로그인 사용자 본인 뽑기는 24시간이 지나도 서울 기준 이번 주(일~토) 말까지 목록에 유지.
 *
 * @param {string | null | undefined} viewerEmail 현재 사용자 이메일(있으면 `mine` 플래그 및 본인 식별)
 * @returns {Promise<Array<{ id: string, nickname: string, numbers: number[], createdAt: string, mine: boolean, photo?: string }>>}
 */
export async function fetchLottoHistory(viewerEmail) {
  const since = new Date(Date.now() - LOTTO_HISTORY_MS);
  const viewerNorm = normalizeLottoEmail(viewerEmail);

  try {
    const logs24hPromise = getPrisma().gameLog.findMany({
      where: {
        game: 'lotto',
        action: 'pick',
        createdAt: { gte: since }
      },
      orderBy: { createdAt: 'desc' },
      take: LOTTO_HISTORY_LIMIT
    });

    const weekMinePromise =
      viewerNorm !== '' ? fetchMyLottoPicksCurrentWeek(viewerNorm) : Promise.resolve([]);

    const [logs24h, weekMineDrafts] = await Promise.all([logs24hPromise, weekMinePromise]);

    /** @type {Map<string, NonNullable<ReturnType<typeof draftFromLottoLog>>>} */
    const byId = new Map();

    for (const log of logs24h) {
      const d = draftFromLottoLog(log, viewerNorm);
      if (d) byId.set(d.id, d);
    }
    for (const d of weekMineDrafts) {
      if (!byId.has(d.id)) byId.set(d.id, d);
    }

    const drafts = [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    /** @type {Map<string, string>} */
    const photoByNorm = new Map();

    const distinctNormEmails = [...new Set(drafts.map((d) => d.pickEmailNorm).filter(Boolean))];

    if (distinctNormEmails.length > 0) {
      /** @type {Array<{ photo: string | null; lowerEmail: string }>} */
      const rows = await getPrisma().$queryRaw`
        SELECT photo, LOWER(COALESCE(email, '')) AS "lowerEmail"
        FROM users
        WHERE LOWER(COALESCE(email, '')) = ANY(${distinctNormEmails}::text[])
      `;

      for (const row of rows) {
        const p = typeof row.photo === 'string' && row.photo.trim() ? row.photo.trim() : '';
        if (p && row.lowerEmail) photoByNorm.set(row.lowerEmail, p);
      }
    }

    /** @type {Array<{ id: string, nickname: string, numbers: number[], createdAt: string, mine: boolean, photo?: string }>} */
    const out = [];

    for (const d of drafts) {
      /** @type {{ id: string, nickname: string, numbers: number[], createdAt: string, mine: boolean, photo?: string }} */
      const row = {
        id: d.id,
        nickname: d.nickname,
        numbers: d.numbers,
        createdAt: d.createdAt,
        mine: d.mine
      };
      const ph = photoByNorm.get(d.pickEmailNorm);
      if (ph) row.photo = ph;
      out.push(row);
    }

    return out;
  } catch {
    return [];
  }
}

/**
 * 마지막 24시간 동안 저장된 인생역전 뽑기 건수(전체 회원 합계)
 */
export async function countAllLottoPicks24h() {
  try {
    return await getPrisma().gameLog.count({
      where: {
        game: 'lotto',
        action: 'pick',
        createdAt: { gte: new Date(Date.now() - LOTTO_HISTORY_MS) }
      }
    });
  } catch {
    return 0;
  }
}

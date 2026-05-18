import { GameLog } from '$lib/models/gameLog.js';

export const LOTTO_HISTORY_MS = 24 * 60 * 60 * 1000;
export const LOTTO_HISTORY_LIMIT = 300;

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
 * 마지막 24시간 로또 기록 목록 (최신순)
 *
 * @param {string | null | undefined} viewerEmail 현재 사용자 이메일(있으면 `mine` 플래그 및 본인 식별)
 * @returns {Promise<Array<{ id: string, nickname: string, numbers: number[], createdAt: string, mine: boolean }>>}
 */
export async function fetchLottoHistory(viewerEmail) {
  const since = new Date(Date.now() - LOTTO_HISTORY_MS);
  try {
    const logs = await GameLog.find({
      game: 'lotto',
      action: 'pick',
      createdAt: { $gte: since }
    })
      .sort({ createdAt: -1 })
      .limit(LOTTO_HISTORY_LIMIT)
      .lean();

    /** @type {Array<{ id: string, nickname: string, numbers: number[], createdAt: string, mine: boolean }>} */
    const out = [];

    const self =
      viewerEmail != null &&
      viewerEmail !== '' &&
      typeof viewerEmail === 'string';

    for (const log of logs) {
      const nickname =
        typeof log.meta?.nickname === 'string' && log.meta.nickname.trim()
          ? log.meta.nickname.trim()
          : null;
      const raw = log.meta?.numbers;
      if (!nickname || !isValidLottoNumbers(raw)) continue;

      const logEmail = typeof log.email === 'string' ? log.email : '';
      const mine = self && logEmail !== '' && logEmail === viewerEmail;

      out.push({
        id: String(log._id),
        nickname,
        numbers: [...raw].sort((a, b) => a - b),
        createdAt: new Date(log.createdAt).toISOString(),
        mine
      });
    }

    return out;
  } catch {
    return [];
  }
}

/**
 * 로그인 사용자가 마지막 24시간 동안 인생역전을 누른 횟수
 *
 * @param {string | null | undefined} viewerEmail
 */
export async function countMyLottoPicks24h(viewerEmail) {
  if (viewerEmail == null || viewerEmail === '' || typeof viewerEmail !== 'string') return 0;
  try {
    return await GameLog.countDocuments({
      game: 'lotto',
      action: 'pick',
      email: viewerEmail,
      createdAt: { $gte: new Date(Date.now() - LOTTO_HISTORY_MS) }
    });
  } catch {
    return 0;
  }
}

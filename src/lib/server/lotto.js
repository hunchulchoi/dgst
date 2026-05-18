import { GameLog } from '$lib/models/gameLog.js';
import { User } from '$lib/models/user.js';

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
 * @returns {Promise<Array<{ id: string, nickname: string, numbers: number[], createdAt: string, mine: boolean, photo?: string }>>}
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

    /** @type {Array<{ id: string, nickname: string, numbers: number[], createdAt: string, mine: boolean, pickEmailNorm: string }>} */
    const drafts = [];

    const viewerNorm = normalizeLottoEmail(viewerEmail);
    const self = viewerNorm !== '';

    for (const log of logs) {
      const nickname =
        typeof log.meta?.nickname === 'string' && log.meta.nickname.trim()
          ? log.meta.nickname.trim()
          : null;
      const raw = log.meta?.numbers;
      if (!nickname || !isValidLottoNumbers(raw)) continue;

      const pickEmailNorm = normalizeLottoEmail(typeof log.email === 'string' ? log.email : '');
      const mine = self && pickEmailNorm !== '' && pickEmailNorm === viewerNorm;

      drafts.push({
        id: String(log._id),
        nickname,
        numbers: [...raw].sort((a, b) => a - b),
        createdAt: new Date(log.createdAt).toISOString(),
        mine,
        pickEmailNorm
      });
    }

    /** @type {Map<string, string>} */
    const photoByNorm = new Map();

    const distinctNormEmails = [...new Set(drafts.map((d) => d.pickEmailNorm).filter(Boolean))];

    if (distinctNormEmails.length > 0) {
      /** @type {Array<{ photo?: string | null; lowerEmail: string }>} */
      const rows = await User.aggregate([
        {
          $match: {
            $expr: {
              $in: [{ $toLower: { $ifNull: ['$email', ''] } }, distinctNormEmails]
            }
          }
        },
        {
          $project: {
            photo: 1,
            lowerEmail: { $toLower: { $ifNull: ['$email', ''] } }
          }
        }
      ]).exec();

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
    return await GameLog.countDocuments({
      game: 'lotto',
      action: 'pick',
      createdAt: { $gte: new Date(Date.now() - LOTTO_HISTORY_MS) }
    });
  } catch {
    return 0;
  }
}

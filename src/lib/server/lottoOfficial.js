/**
 * 한국 로또 645 공식 결과(동행복권) 조회 및 직전 주 사이트 뽑기와의 등수 비교 — GameLog 활용(DB 스키마 변경 없음)
 */
import { z } from 'zod';
import { GameLog } from '$lib/models/gameLog.js';
import { User } from '$lib/models/user.js';
import { isValidLottoNumbers, normalizeLottoEmail } from '$lib/server/lotto.js';

const DH_ENDPOINT = 'https://www.dhlottery.co.kr/common.do';

const dhDrawResponseSchema = z
  .object({
    returnValue: z.string(),
    drwNo: z.union([z.number(), z.string()]).optional(),
    drwNoDate: z.string().optional(),
    drwtNo1: z.union([z.number(), z.string()]),
    drwtNo2: z.union([z.number(), z.string()]),
    drwtNo3: z.union([z.number(), z.string()]),
    drwtNo4: z.union([z.number(), z.string()]),
    drwtNo5: z.union([z.number(), z.string()]),
    drwtNo6: z.union([z.number(), z.string()]),
    bnusNo: z.union([z.number(), z.string()])
  })
  .passthrough();

/** @param {unknown} x */
function toNum(x) {
  const n = typeof x === 'string' ? Number.parseInt(String(x).trim(), 10) : x;
  return typeof n === 'number' && Number.isFinite(n) ? n : NaN;
}

/** @typedef {{ drwNo: number, drwNoDate: string, mains: number[], bonus: number }} ParsedOfficialDraw */

/**
 * 로또 645 등수 — 공식 규칙: 6개 동일·5+보너스·5·4·3
 * @param {number[]} userNumbers
 * @param {number[]} mains
 * @param {number} bonus
 * @returns { 1 | 2 | 3 | 4 | 5 | null }
 */
export function rankKoLotto645(userNumbers, mains, bonus) {
  if (!Array.isArray(userNumbers) || userNumbers.length !== 6 || !Number.isFinite(bonus)) return null;
  const user = new Set(userNumbers);
  const mainSet = new Set(mains);
  if (mainSet.size !== 6) return null;

  let matchedMain = 0;
  for (const m of mains) {
    if (user.has(m)) matchedMain++;
  }
  const hasBonus = user.has(bonus);

  if (matchedMain === 6) return 1;
  if (matchedMain === 5 && hasBonus) return 2;
  if (matchedMain === 5) return 3;
  if (matchedMain === 4) return 4;
  if (matchedMain === 3) return 5;
  return null;
}

/** @param {number | null} rank */
export function rankLabel(rank) {
  if (rank === 1) return '1등';
  if (rank === 2) return '2등';
  if (rank === 3) return '3등';
  if (rank === 4) return '4등';
  if (rank === 5) return '5등';
  return '-';
}

function formatYmdSeoul(ms) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(ms));
}

function weekdayIndexSeoul(ms) {
  const w = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    weekday: 'short'
  }).format(new Date(ms));
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[w] ?? 0;
}

/**
 * Anchor 시각 기준 "이번 주"(일요일 00:00 ~ 토요일 23:59:59.999, Asia/Seoul)
 *
 * @param {number} [anchorMs]
 */
export function currentSeoulWeekSunSatRangeUtc(anchorMs = Date.now()) {
  const ymd = formatYmdSeoul(anchorMs);
  const dow = weekdayIndexSeoul(anchorMs);
  const midday = Date.parse(`${ymd}T12:00:00+09:00`);
  const thisSundayMidday = midday - dow * 86400000;
  const satMidday = thisSundayMidday + 6 * 86400000;
  const sunYmd = formatYmdSeoul(thisSundayMidday);
  const satYmd = formatYmdSeoul(satMidday);
  const weekStartUtc = Date.parse(`${sunYmd}T00:00:00+09:00`);
  const weekEndUtc = Date.parse(`${satYmd}T23:59:59.999+09:00`);
  return {
    weekStartUtc,
    weekEndUtc,
    labelStartYmd: sunYmd,
    labelEndYmd: satYmd
  };
}

/**
 * Anchor 시각 기준 "직전 한 주"(월요일 00:00 ~ 일요일 23:59:59.999, Asia/Seoul)
 *
 * @param {number} [anchorMs]
 */
export function previousSeoulWeekInclusiveRangeUtc(anchorMs = Date.now()) {
  const ymd = formatYmdSeoul(anchorMs);
  const dow = weekdayIndexSeoul(anchorMs);
  const midday = Date.parse(`${ymd}T12:00:00+09:00`);
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  const thisMondayMidday = midday - daysSinceMonday * 86400000;
  const prevMondayMidday = thisMondayMidday - 7 * 86400000;

  const monYmd = formatYmdSeoul(prevMondayMidday);
  const weekStartUtc = Date.parse(`${monYmd}T00:00:00+09:00`);

  const sunMidday = prevMondayMidday + 6 * 86400000;
  const sunYmd = formatYmdSeoul(sunMidday);
  const weekEndUtc = Date.parse(`${sunYmd}T23:59:59.999+09:00`);

  return {
    weekStartUtc,
    weekEndUtc,
    labelStartYmd: monYmd,
    labelEndYmd: sunYmd
  };
}

/** @typedef {{ mains: unknown, bonus?: unknown, drwNo?: unknown, drwNoDate?: unknown }} MetaLike */

/**
 * meta 문서 직렬화 (불변)
 * @param {ParsedOfficialDraw} draw
 */
function metaFromParsed(draw) {
  return {
    drwNo: draw.drwNo,
    drwNoDate: draw.drwNoDate,
    mains: [...draw.mains],
    bonus: draw.bonus,
    syncedAt: new Date().toISOString()
  };
}

/**
 * 저장된 meta에서 공식 결과 복구합니다.
 *
 * @param {MetaLike | Record<string, unknown>} meta
 * @returns {ParsedOfficialDraw | null}
 */
function parsedFromStoredMeta(meta) {
  const drwNo = typeof meta?.drwNo === 'number' ? meta.drwNo : Number(meta?.drwNo);
  /** @type {unknown} */
  const mainsUnknown = Array.isArray(meta?.mains) ? meta.mains : null;
  const bonusNum = typeof meta?.bonus === 'number' ? meta.bonus : Number(meta?.bonus);
  const mainsRaw = mainsUnknown ? mainsUnknown.map((x) => Number(x)) : [];

  /** @type {ParsedOfficialDraw} */
  const normalized = {
    drwNo,
    drwNoDate: typeof meta?.drwNoDate === 'string' ? meta.drwNoDate : '',
    mains: [...mainsRaw].sort((a, b) => a - b),
    bonus: bonusNum
  };

  if (
    !Number.isInteger(normalized.drwNo) ||
    normalized.mains.length !== 6 ||
    normalized.mains.some((n) => !Number.isInteger(n) || n < 1 || n > 45)
  )
    return null;
  if (!Number.isInteger(normalized.bonus) || normalized.bonus < 1 || normalized.bonus > 45) return null;
  return normalized;
}

/**
 * 회차번호로 동행복권 JSON 한 번 요청합니다.
 * @param {number} drwNo
 * @returns {Promise<ParsedOfficialDraw | null>}
 */
export async function fetchOfficialDrawJson(drwNo) {
  if (!Number.isInteger(drwNo) || drwNo < 1) return null;
  try {
    const url = `${DH_ENDPOINT}?method=getLottoNumber&drwNo=${encodeURIComponent(String(drwNo))}`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json, text/plain, */*',
        Referer: 'https://dhlottery.co.kr/',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36 (compatible; dgst)'
      },
      signal: AbortSignal.timeout(20000)
    });
    const text = await res.text();
    /** @type {unknown} */
    const rawJson = JSON.parse(text);
    const parsed = dhDrawResponseSchema.safeParse(rawJson);
    if (!parsed.success || parsed.data.returnValue !== 'success') return null;

    const d = parsed.data;
    const mainsRaw = [
      toNum(d.drwtNo1),
      toNum(d.drwtNo2),
      toNum(d.drwtNo3),
      toNum(d.drwtNo4),
      toNum(d.drwtNo5),
      toNum(d.drwtNo6)
    ].sort((a, b) => a - b);
    const bonus = toNum(d.bnusNo);
    let drNum =
      typeof d.drwNo === 'number' ? d.drwNo : Number.parseInt(String(d.drwNo ?? ''), 10);

    if (!Number.isFinite(drNum)) drNum = drwNo;

    /** @type {ParsedOfficialDraw} */
    const out = {
      drwNo: drNum,
      drwNoDate: typeof d.drwNoDate === 'string' ? d.drwNoDate : '',
      mains: mainsRaw,
      bonus
    };

    if (out.mains.some((n) => !Number.isInteger(n) || n < 1 || n > 45)) return null;
    if (!Number.isInteger(out.bonus) || out.bonus < 1 || out.bonus > 45) return null;
    return out;
  } catch {
    return null;
  }
}

/**
 * 저장된 결과 중 회차번호 최신 1건
 * @returns {Promise<ParsedOfficialDraw | null>}
 */
export async function getLatestStoredOfficialDraw() {
  try {
    const docs = await GameLog.find({
      game: 'lotto_official',
      action: 'draw_result'
    })
      .sort({ createdAt: -1 })
      .limit(250)
      .lean();

    /** @type {ParsedOfficialDraw | null} */
    let best = null;
    let bestRound = -1;

    for (const doc of docs) {
      const m = doc?.meta;
      if (!m || typeof m !== 'object') continue;
      const candidate = parsedFromStoredMeta(/** @type {MetaLike} */ (m));
      if (!candidate) continue;
      if (candidate.drwNo > bestRound) {
        bestRound = candidate.drwNo;
        best = candidate;
      }
    }
    return best;
  } catch {
    return null;
  }
}

/**
 * 회차 결과가 이미 저장됐는지 (중복 저장 방지)
 * @param {number} drwNo
 */
export async function officialDrawStored(drwNo) {
  try {
    const docs = await GameLog.find({
      game: 'lotto_official',
      action: 'draw_result'
    })
      .select({ meta: 1 })
      .sort({ createdAt: -1 })
      .limit(400)
      .lean();
    return docs.some((d) => Number(d.meta?.drwNo) === drwNo);
  } catch {
    return false;
  }
}

/**
 * 당첨 결과 DB에 기록합니다.
 *
 * @param {ParsedOfficialDraw} draw
 */
export async function storeOfficialDraw(draw) {
  if (await officialDrawStored(draw.drwNo)) return false;
  try {
    await GameLog.create({
      game: 'lotto_official',
      action: 'draw_result',
      meta: metaFromParsed(draw)
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 새 회차 결과를 불러와 저장합니다. DB에 회차 없으면 이진 검색으로 최신 회차 1건을 찾습니다.
 *
 * @returns {Promise<{ added: ParsedOfficialDraw | null; tried: boolean; notes: string }>}
 */
export async function syncOfficialDrawFromDhlottery() {
  /** @type {string[]} */
  const notes = [];

  const lastStored = await getLatestStoredOfficialDraw();

  /** @type {ParsedOfficialDraw | null} */
  let added = null;

  if (lastStored) {
    for (let n = lastStored.drwNo + 1; n <= lastStored.drwNo + 4; n++) {
      const next = await fetchOfficialDrawJson(n);
      if (next) {
        const ok = await storeOfficialDraw(next);
        if (ok) {
          added = next;
          notes.push(`새 회차 저장: ${n}`);
        } else {
          notes.push(`회차 ${n} 데이터는 이미 있음`);
        }
        break;
      }
      notes.push(`회차 ${n} 미공개 또는 실패`);
    }
    if (!added && notes.length === 0) {
      notes.push('추적할 새 회차 없음');
    }
    return { added, tried: true, notes: notes.join(' | ') };
  }

  let lo = 1;
  let hi = 3000;
  /** @type {ParsedOfficialDraw | null} */
  let found = null;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const d = await fetchOfficialDrawJson(mid);
    if (d) {
      found = d;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (found && (await storeOfficialDraw(found))) {
    added = found;
    notes.push(`초기 회차 적재 ${found.drwNo}`);
  }
  const noteStr = notes.length ? notes.join(' | ') : '동기화 결과 없음';
  return { added, tried: true, notes: noteStr };
}

/**
 * 서울 직전 주 범위의 사이트 뽑기 + 최신 저장된 공식 결과로 등수 매칭
 *
 * @param {{ anchorMs?: number }} [opts]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function computeLottoWeekMatchSummary(opts = {}) {
  const anchorMs = typeof opts.anchorMs === 'number' ? opts.anchorMs : Date.now();
  const official = await getLatestStoredOfficialDraw();
  const { weekStartUtc, weekEndUtc, labelStartYmd, labelEndYmd } =
    previousSeoulWeekInclusiveRangeUtc(anchorMs);

  /** @type {Record<string, unknown>} */
  const empty = {
    hasOfficial: false,
    official: null,
    weekLabel: `${labelStartYmd} ~ ${labelEndYmd}`,
    winners: [],
    picksInWeek: 0
  };

  if (!official) return empty;

  const officialSerializable = {
    drwNo: official.drwNo,
    drwNoDate: official.drwNoDate,
    mains: [...official.mains],
    bonus: official.bonus
  };

  try {
    const logs = await GameLog.find({
      game: 'lotto',
      action: 'pick',
      createdAt: { $gte: new Date(weekStartUtc), $lte: new Date(weekEndUtc) }
    })
      .sort({ createdAt: 1 })
      .limit(5000)
      .lean();

    /** @type {Array<{ rank: number, nickname: string, numbers: number[], createdAt: string, pickId: string, emailNorm: string }>} */
    const winnersDraft = [];
    let validPickCount = 0;

    for (const doc of logs) {
      const m = doc.meta;
      if (!m || typeof m !== 'object') continue;
      const nickname =
        typeof m.nickname === 'string' && m.nickname.trim() ? m.nickname.trim() : null;
      const rawNums = /** @type {unknown} */ (m.numbers);
      if (!nickname || !isValidLottoNumbers(rawNums)) continue;
      validPickCount++;

      const nums = [.../** @type {number[]} */ (rawNums)].sort((a, b) => a - b);

      const r = rankKoLotto645(nums, official.mains, official.bonus);
      if (r != null && r <= 5) {
        winnersDraft.push({
          rank: r,
          nickname,
          numbers: nums,
          createdAt: new Date(doc.createdAt).toISOString(),
          pickId: String(doc._id),
          emailNorm: normalizeLottoEmail(typeof doc.email === 'string' ? doc.email : '')
        });
      }
    }

    winnersDraft.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.createdAt.localeCompare(b.createdAt);
    });

    /** @type {Map<string, string>} */
    const winnerPhotoByNorm = new Map();
    const winnerNorms = [...new Set(winnersDraft.map((w) => w.emailNorm).filter(Boolean))];

    if (winnerNorms.length > 0) {
      /** @type {Array<{ photo?: string | null; lowerEmail: string }>} */
      const uph = await User.aggregate([
        {
          $match: {
            $expr: {
              $in: [{ $toLower: { $ifNull: ['$email', ''] } }, winnerNorms]
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

      for (const row of uph) {
        const p = typeof row.photo === 'string' && row.photo.trim() ? row.photo.trim() : '';
        if (p && row.lowerEmail) winnerPhotoByNorm.set(row.lowerEmail, p);
      }
    }

    /** @type {Array<{ rank: number, nickname: string, numbers: number[], createdAt: string, pickId: string, photo?: string }>} */
    const winners = [];

    for (const w of winnersDraft) {
      /** @type {{ rank: number, nickname: string, numbers: number[], createdAt: string, pickId: string, photo?: string }} */
      const pub = {
        rank: w.rank,
        nickname: w.nickname,
        numbers: w.numbers,
        createdAt: w.createdAt,
        pickId: w.pickId
      };
      const ph = winnerPhotoByNorm.get(w.emailNorm);
      if (ph) pub.photo = ph;
      winners.push(pub);
    }

    return {
      hasOfficial: true,
      official: officialSerializable,
      weekLabel: `${labelStartYmd} ~ ${labelEndYmd}`,
      winners,
      picksInWeek: validPickCount
    };
  } catch {
    return {
      hasOfficial: true,
      official: officialSerializable,
      weekLabel: `${labelStartYmd} ~ ${labelEndYmd}`,
      winners: [],
      picksInWeek: 0
    };
  }
}

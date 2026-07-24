/**
 * @typedef {{
 *   id: 'scout' | 'lightning' | 'high-roller' | 'frenzy';
 *   name: string;
 *   description: string;
 *   anteMultiplier: number;
 *   maxRaises: number;
 * }} SeotdaEvent
 */

/** @type {Record<number, SeotdaEvent>} */
const SERIES_EVENTS = {
  1: {
    id: 'scout',
    name: '탐색전',
    description: '레이즈는 2번까지만',
    anteMultiplier: 1,
    maxRaises: 2
  },
  2: {
    id: 'lightning',
    name: '번개판',
    description: '레이즈 단 1번',
    anteMultiplier: 1,
    maxRaises: 1
  },
  3: {
    id: 'high-roller',
    name: '큰판',
    description: '기본 판돈 2배',
    anteMultiplier: 2,
    maxRaises: 3
  },
  4: {
    id: 'frenzy',
    name: '광란판',
    description: '레이즈 최대 5번',
    anteMultiplier: 1,
    maxRaises: 5
  }
};

/**
 * @param {{ handNo?: number; isBoss?: boolean } | null | undefined} series
 * @param {boolean} enabled
 * @returns {SeotdaEvent | null}
 */
export function eventForSeries(series, enabled) {
  if (!enabled || !series || series.isBoss) return null;
  return SERIES_EVENTS[Math.max(1, Math.min(4, Number(series.handNo) || 1))] ?? null;
}

/**
 * @param {{ event?: SeotdaEvent | null }} round
 * @param {number} fallback
 */
export function roundRaiseLimit(round, fallback) {
  const configured = Number(round.event?.maxRaises);
  return Number.isFinite(configured) && configured >= 0 ? configured : fallback;
}

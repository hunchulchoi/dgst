/** @typedef {'navigation' | 'initial'} SlowLoadType */

/** @typedef {Object} SlowLoadPayload
 * @property {SlowLoadType} type
 * @property {number} durationMs
 * @property {string} [pathname]
 * @property {string} [from]
 * @property {string} [to]
 */

/** @type {number} */
const SLOW_LOAD_THRESHOLD_MS = 2000;
export const MAX_INITIAL_LOAD_DURATION_MS = 5 * 60 * 1000;

/**
 * 백그라운드 정지·절전 시간이 포함된 비현실적인 초기 로드 측정을 제외한다.
 * @param {Pick<PerformanceNavigationTiming, 'loadEventEnd' | 'startTime' | 'name'>} entry
 * @param {string} fallbackPathname
 */
export function getInitialLoadMeasurement(entry, fallbackPathname) {
  const durationMs = entry.loadEventEnd - entry.startTime;
  if (
    !Number.isFinite(durationMs) ||
    durationMs <= 0 ||
    durationMs > MAX_INITIAL_LOAD_DURATION_MS
  ) {
    return null;
  }

  let pathname = fallbackPathname;
  try {
    pathname = new URL(entry.name).pathname;
  } catch {
    // 오래된 브라우저의 불완전한 entry.name은 현재 경로로 대체한다.
  }

  return { durationMs, pathname };
}

/**
 * 느린 페이지 로딩·네비게이션을 콘솔 및 서버 로그로 남긴다.
 * @param {SlowLoadPayload} payload
 */
export function reportSlowLoad(payload) {
  const { type, durationMs, pathname, from, to } = payload;

  if (!Number.isFinite(durationMs) || durationMs < SLOW_LOAD_THRESHOLD_MS) {
    return;
  }

  const roundedMs = Math.round(durationMs);
  const routeLabel =
    type === 'initial' ? (pathname ?? '(unknown)') : `${from ?? '?'} → ${to ?? pathname ?? '?'}`;

  const summary = `[slow-${type}] ${routeLabel} (${roundedMs}ms)`;

  console.warn(summary, payload);

  try {
    void fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        level: 'warn',
        message: summary,
        slowLoad: true,
        type,
        durationMs: roundedMs,
        pathname,
        from,
        to
      })
    });
  } catch {
    // 로깅 실패는 사용자 흐름을 방해하지 않음
  }
}

/**
 * 브라우저 Performance API로 초기 페이지 로드 소요 시간을 측정한다.
 * @param {string} pathname
 */
export function reportSlowInitialLoad(pathname) {
  try {
    const [entry] = performance.getEntriesByType('navigation');
    if (!(entry instanceof PerformanceNavigationTiming)) return;

    const measurement = getInitialLoadMeasurement(entry, pathname);
    if (!measurement) return;

    reportSlowLoad({
      type: 'initial',
      ...measurement
    });
  } catch (error) {
    console.error('[slow-initial-load] 측정 실패:', error);
  }
}

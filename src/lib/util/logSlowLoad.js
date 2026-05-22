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
    type === 'initial'
      ? pathname ?? '(unknown)'
      : `${from ?? '?'} → ${to ?? pathname ?? '?'}`;

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

    const durationMs = entry.loadEventEnd - entry.startTime;
    if (durationMs <= 0) return;

    reportSlowLoad({
      type: 'initial',
      durationMs,
      pathname
    });
  } catch (error) {
    console.error('[slow-initial-load] 측정 실패:', error);
  }
}

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
const MAX_SLOW_RESOURCES = 5;
const MAX_LONG_TASKS = 3;

/** @type {Array<Pick<PerformanceEntry, 'startTime' | 'duration'>>} */
let initialLongTaskEntries = [];
/** @type {PerformanceObserver | undefined} */
let initialLongTaskObserver;

/** @param {unknown} value */
function roundedNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : 0;
}

/**
 * @param {Pick<PerformanceNavigationTiming,
 *  'startTime' | 'domainLookupStart' | 'domainLookupEnd' | 'connectStart' |
 *  'secureConnectionStart' | 'connectEnd' | 'requestStart' | 'responseStart' |
 *  'responseEnd' | 'domInteractive' | 'domContentLoadedEventEnd' | 'loadEventEnd' |
 *  'transferSize' | 'encodedBodySize' | 'decodedBodySize' | 'nextHopProtocol' |
 *  'type' | 'redirectCount'>} entry
 */
export function getNavigationTimingBreakdown(entry) {
  /** @param {unknown} end @param {unknown} start */
  const phase = (end, start) => roundedNonNegative(Number(end) - Number(start));

  return {
    dnsMs: phase(entry.domainLookupEnd, entry.domainLookupStart),
    tcpMs: phase(entry.connectEnd, entry.connectStart),
    tlsMs:
      Number(entry.secureConnectionStart) > 0
        ? phase(entry.connectEnd, entry.secureConnectionStart)
        : 0,
    ttfbMs: phase(entry.responseStart, entry.requestStart),
    downloadMs: phase(entry.responseEnd, entry.responseStart),
    domInteractiveMs: phase(entry.domInteractive, entry.responseEnd),
    domContentLoadedMs: phase(entry.domContentLoadedEventEnd, entry.responseEnd),
    postDomLoadMs: phase(entry.loadEventEnd, entry.domContentLoadedEventEnd),
    totalMs: phase(entry.loadEventEnd, entry.startTime),
    transferSize: roundedNonNegative(entry.transferSize),
    encodedBodySize: roundedNonNegative(entry.encodedBodySize),
    decodedBodySize: roundedNonNegative(entry.decodedBodySize),
    protocol: String(entry.nextHopProtocol || '').slice(0, 16),
    navigationType: String(entry.type || '').slice(0, 16),
    redirectCount: roundedNonNegative(entry.redirectCount)
  };
}

/**
 * URL 쿼리·해시는 버리고, 외부 리소스는 호스트명만 남긴다.
 * @param {string} name
 * @param {string} pageOrigin
 */
function summarizeResourceName(name, pageOrigin) {
  try {
    const url = new URL(name, pageOrigin);
    return url.origin === pageOrigin ? url.pathname.slice(0, 256) : url.hostname.slice(0, 128);
  } catch {
    return '(invalid-resource)';
  }
}

/**
 * @param {Array<Pick<PerformanceResourceTiming,
 *  'name' | 'initiatorType' | 'duration' | 'transferSize' |
 *  'encodedBodySize' | 'decodedBodySize'>>} entries
 * @param {string} pageOrigin
 */
export function getSlowResourceSummaries(entries, pageOrigin) {
  return entries
    .filter((entry) => Number.isFinite(entry.duration) && entry.duration > 0)
    .sort((a, b) => b.duration - a.duration)
    .slice(0, MAX_SLOW_RESOURCES)
    .map((entry) => ({
      name: summarizeResourceName(entry.name, pageOrigin),
      initiatorType: String(entry.initiatorType || 'other').slice(0, 32),
      durationMs: roundedNonNegative(entry.duration),
      transferSize: roundedNonNegative(entry.transferSize),
      encodedBodySize: roundedNonNegative(entry.encodedBodySize),
      decodedBodySize: roundedNonNegative(entry.decodedBodySize)
    }));
}

/** @param {Array<Pick<PerformanceEntry, 'startTime' | 'duration'>>} entries */
export function summarizeLongTasks(entries) {
  const validEntries = entries.filter(
    (entry) => Number.isFinite(entry.duration) && entry.duration > 0
  );
  const durations = validEntries.map((entry) => entry.duration);

  return {
    count: validEntries.length,
    totalDurationMs: roundedNonNegative(durations.reduce((sum, duration) => sum + duration, 0)),
    maxDurationMs: roundedNonNegative(durations.length > 0 ? Math.max(...durations) : 0),
    top: [...validEntries]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, MAX_LONG_TASKS)
      .map((entry) => ({
        startTimeMs: roundedNonNegative(entry.startTime),
        durationMs: roundedNonNegative(entry.duration)
      }))
  };
}

/** 초기 hydration을 포함하도록 layout 초기화 시점부터 Long Task를 관찰한다. */
export function startInitialLoadLongTaskObserver() {
  if (initialLongTaskObserver || typeof PerformanceObserver === 'undefined') return;

  try {
    initialLongTaskObserver = new PerformanceObserver((list) => {
      initialLongTaskEntries.push(...list.getEntries());
    });
    initialLongTaskObserver.observe({ type: 'longtask', buffered: true });
  } catch {
    initialLongTaskObserver = undefined;
  }
}

function finishInitialLoadLongTaskObserver() {
  if (initialLongTaskObserver) {
    initialLongTaskEntries.push(...initialLongTaskObserver.takeRecords());
    initialLongTaskObserver.disconnect();
    initialLongTaskObserver = undefined;
  }

  const summary = summarizeLongTasks(initialLongTaskEntries);
  initialLongTaskEntries = [];
  return summary;
}

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
 * @param {SlowLoadPayload & { performanceDetails?: Record<string, unknown> }} payload
 */
export function reportSlowLoad(payload) {
  const { type, durationMs, pathname, from, to, performanceDetails } = payload;

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
        to,
        performanceDetails
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
    if (!(entry instanceof PerformanceNavigationTiming)) {
      finishInitialLoadLongTaskObserver();
      return;
    }

    const measurement = getInitialLoadMeasurement(entry, pathname);
    const longTasks = finishInitialLoadLongTaskObserver();
    if (!measurement) return;
    if (measurement.durationMs < SLOW_LOAD_THRESHOLD_MS) return;

    const resources = getSlowResourceSummaries(
      /** @type {PerformanceResourceTiming[]} */ (performance.getEntriesByType('resource')),
      window.location.origin
    );

    reportSlowLoad({
      type: 'initial',
      ...measurement,
      performanceDetails: {
        navigation: getNavigationTimingBreakdown(entry),
        resources,
        longTasks
      }
    });
  } catch (error) {
    finishInitialLoadLongTaskObserver();
    console.error('[slow-initial-load] 측정 실패:', error);
  }
}

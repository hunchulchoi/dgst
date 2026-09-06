/** @typedef {'navigation' | 'initial'} SlowLoadType */
/** @typedef {'foreground' | 'history' | 'background'} InitialLoadContext */

/** @typedef {Object} SlowLoadPayload
 * @property {SlowLoadType} type
 * @property {number} durationMs
 * @property {string} [pathname]
 * @property {string} [from]
 * @property {string} [to]
 * @property {InitialLoadContext} [initialLoadContext]
 */

/** @type {number} */
const SLOW_LOAD_THRESHOLD_MS = 2000;
const INITIAL_LOAD_EVENT_ALERT_THRESHOLD_MS = 3000;
const INITIAL_FCP_ALERT_THRESHOLD_MS = 1800;
const INITIAL_LCP_ALERT_THRESHOLD_MS = 2500;
const INITIAL_TTFB_ALERT_THRESHOLD_MS = 800;
export const MAX_INITIAL_LOAD_DURATION_MS = 5 * 60 * 1000;
const MAX_SLOW_RESOURCES = 5;
const MAX_LONG_TASKS = 3;

/** @type {Array<Pick<PerformanceEntry, 'startTime' | 'duration'>>} */
let initialLongTaskEntries = [];
/** @type {PerformanceObserver | undefined} */
let initialLongTaskObserver;
/** @type {PerformanceObserver | undefined} */
let initialLargestContentfulPaintObserver;
/** @type {number | undefined} */
let initialLargestContentfulPaintMs;
let initialWasHidden = false;
let initialPageShowPersisted = false;
let initialObservationStarted = false;

function recordInitialVisibility() {
  if (document.visibilityState === 'hidden') initialWasHidden = true;
}

/** @param {PageTransitionEvent} event */
function recordInitialPageShow(event) {
  if (event.persisted) initialPageShowPersisted = true;
}

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
 *  'encodedBodySize' | 'decodedBodySize' | 'startTime' | 'responseEnd'>>} entries
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
      startTimeMs: roundedNonNegative(entry.startTime),
      responseEndMs: roundedNonNegative(entry.responseEnd),
      durationMs: roundedNonNegative(entry.duration),
      transferSize: roundedNonNegative(entry.transferSize),
      encodedBodySize: roundedNonNegative(entry.encodedBodySize),
      decodedBodySize: roundedNonNegative(entry.decodedBodySize)
    }));
}

/**
 * 마지막에 끝난 리소스도 별도로 남겨 load 이벤트 지연 원인을 찾는다.
 * @param {Array<Pick<PerformanceResourceTiming,
 *  'name' | 'initiatorType' | 'duration' | 'transferSize' |
 *  'encodedBodySize' | 'decodedBodySize' | 'startTime' | 'responseEnd'>>} entries
 * @param {string} pageOrigin
 */
export function getLatestResourceSummaries(entries, pageOrigin) {
  return entries
    .filter((entry) => Number.isFinite(entry.responseEnd) && entry.responseEnd > 0)
    .sort((a, b) => b.responseEnd - a.responseEnd)
    .slice(0, MAX_SLOW_RESOURCES)
    .map((entry) => ({
      name: summarizeResourceName(entry.name, pageOrigin),
      initiatorType: String(entry.initiatorType || 'other').slice(0, 32),
      startTimeMs: roundedNonNegative(entry.startTime),
      responseEndMs: roundedNonNegative(entry.responseEnd),
      durationMs: roundedNonNegative(entry.duration),
      transferSize: roundedNonNegative(entry.transferSize),
      encodedBodySize: roundedNonNegative(entry.encodedBodySize),
      decodedBodySize: roundedNonNegative(entry.decodedBodySize)
    }));
}

/** @param {Array<Pick<PerformanceEntry, 'name' | 'startTime'>>} entries */
export function getFirstContentfulPaintMs(entries) {
  const entry = entries.find((candidate) => candidate.name === 'first-contentful-paint');
  return entry ? roundedNonNegative(entry.startTime) : undefined;
}

/** @param {Pick<PerformanceNavigationTiming, 'type'>} entry */
export function getInitialLoadContext(entry) {
  if (initialWasHidden || document.visibilityState === 'hidden') return 'background';
  if (initialPageShowPersisted || entry.type === 'back_forward') return 'history';
  return 'foreground';
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
  if (initialObservationStarted) return;
  initialObservationStarted = true;

  initialWasHidden = document.visibilityState === 'hidden';
  document.addEventListener('visibilitychange', recordInitialVisibility);
  window.addEventListener('pageshow', recordInitialPageShow);
  if (typeof PerformanceObserver === 'undefined') return;

  try {
    initialLongTaskObserver = new PerformanceObserver((list) => {
      initialLongTaskEntries.push(...list.getEntries());
    });
    initialLongTaskObserver.observe({ type: 'longtask', buffered: true });
  } catch {
    initialLongTaskObserver = undefined;
  }

  try {
    initialLargestContentfulPaintObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const entry = entries[entries.length - 1];
      if (entry) initialLargestContentfulPaintMs = roundedNonNegative(entry.startTime);
    });
    initialLargestContentfulPaintObserver.observe({
      type: 'largest-contentful-paint',
      buffered: true
    });
  } catch {
    initialLargestContentfulPaintObserver = undefined;
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

function finishInitialLargestContentfulPaintObserver() {
  if (initialLargestContentfulPaintObserver) {
    const entries = initialLargestContentfulPaintObserver.takeRecords();
    const entry = entries[entries.length - 1];
    if (entry) initialLargestContentfulPaintMs = roundedNonNegative(entry.startTime);
    initialLargestContentfulPaintObserver.disconnect();
    initialLargestContentfulPaintObserver = undefined;
  }
  return initialLargestContentfulPaintMs;
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
 * foreground 초기 로드에서 운영 경보로 볼 지표만 남긴다.
 * `loadEventEnd` 단독 값은 비핵심 리소스에 쉽게 늘어나므로 3초로 둔다.
 * @param {{ durationMs: number, firstContentfulPaintMs?: number, largestContentfulPaintMs?: number, navigation: { ttfbMs: number } }} metrics
 */
export function getInitialLoadAlertReasons(metrics) {
  const reasons = [];
  if (metrics.durationMs >= INITIAL_LOAD_EVENT_ALERT_THRESHOLD_MS) reasons.push('loadEventEnd');
  if ((metrics.firstContentfulPaintMs ?? 0) >= INITIAL_FCP_ALERT_THRESHOLD_MS) reasons.push('fcp');
  if ((metrics.largestContentfulPaintMs ?? 0) >= INITIAL_LCP_ALERT_THRESHOLD_MS) reasons.push('lcp');
  if (metrics.navigation.ttfbMs >= INITIAL_TTFB_ALERT_THRESHOLD_MS) reasons.push('ttfb');
  return reasons;
}

/**
 * 느린 페이지 로딩·네비게이션을 콘솔 및 서버 로그로 남긴다.
 * @param {SlowLoadPayload & { performanceDetails?: Record<string, unknown> }} payload
 */
export function reportSlowLoad(payload) {
  const { type, durationMs, pathname, from, to, initialLoadContext, performanceDetails } = payload;

  const initialMetricAlert =
    type === 'initial' &&
    Array.isArray(performanceDetails?.alertReasons) &&
    performanceDetails.alertReasons.length > 0;
  if (!Number.isFinite(durationMs) || (!initialMetricAlert && durationMs < SLOW_LOAD_THRESHOLD_MS)) {
    return;
  }

  const roundedMs = Math.round(durationMs);
  const routeLabel =
    type === 'initial' ? (pathname ?? '(unknown)') : `${from ?? '?'} → ${to ?? pathname ?? '?'}`;

  // load completion includes subresources/background time; it is not time to usable UI.
  const timingLabel =
    type === 'initial'
      ? `loadEventEnd=${roundedMs}ms, context=${initialLoadContext ?? 'unknown'}, FCP=${performanceDetails?.firstContentfulPaintMs ?? 'unknown'}ms, LCP-at-load=${performanceDetails?.largestContentfulPaintMs ?? 'unknown'}ms`
      : `${roundedMs}ms`;
  const summary = `[slow-${type}] ${routeLabel} (${timingLabel})`;

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
        initialLoadContext,
        performanceDetails
      })
    }).catch(() => {});
  } catch {
    // 로깅 실패는 사용자 흐름을 방해하지 않음
  }
}

/**
 * load 핸들러가 끝난 다음 task에서 읽어 아직 0인 loadEventEnd 누락을 막는다.
 * 호출 시점의 경로를 보존하고, layout 해제 시 예약을 취소할 수 있게 한다.
 * @param {string} pathname
 */
export function reportSlowInitialLoad(pathname) {
  const timer = setTimeout(() => collectSlowInitialLoad(pathname), 0);
  return () => {
    clearTimeout(timer);
    finishInitialLoadLongTaskObserver();
    finishInitialLargestContentfulPaintObserver();
    stopInitialLoadContextListeners();
  };
}

function stopInitialLoadContextListeners() {
  document.removeEventListener('visibilitychange', recordInitialVisibility);
  window.removeEventListener('pageshow', recordInitialPageShow);
}

/** @param {string} pathname */
function collectSlowInitialLoad(pathname) {
  try {
    const [entry] = performance.getEntriesByType('navigation');
    if (!(entry instanceof PerformanceNavigationTiming)) {
      finishInitialLoadLongTaskObserver();
      return;
    }

    const measurement = getInitialLoadMeasurement(entry, pathname);
    const longTasks = finishInitialLoadLongTaskObserver();
    const largestContentfulPaintMs = finishInitialLargestContentfulPaintObserver();
    if (!measurement) return;
    const initialLoadContext = getInitialLoadContext(entry);
    // back/forward cache와 백그라운드 탭 정지는 실제 첫 화면 체감 경보가 아니다.
    if (initialLoadContext !== 'foreground') return;

    const navigation = getNavigationTimingBreakdown(entry);
    const firstContentfulPaintMs = getFirstContentfulPaintMs(performance.getEntriesByType('paint'));
    const alertReasons = getInitialLoadAlertReasons({
      durationMs: measurement.durationMs,
      firstContentfulPaintMs,
      largestContentfulPaintMs,
      navigation
    });
    if (alertReasons.length === 0) return;

    const resourceEntries = /** @type {PerformanceResourceTiming[]} */ (
      performance.getEntriesByType('resource')
    );
    const resources = getSlowResourceSummaries(resourceEntries, window.location.origin);

    reportSlowLoad({
      type: 'initial',
      ...measurement,
      initialLoadContext,
      performanceDetails: {
        navigation,
        resources,
        latestResources: getLatestResourceSummaries(resourceEntries, window.location.origin),
        firstContentfulPaintMs,
        largestContentfulPaintMs,
        alertReasons,
        longTasks
      }
    });
  } catch (error) {
    console.error('[slow-initial-load] 측정 실패:', error);
  } finally {
    finishInitialLoadLongTaskObserver();
    finishInitialLargestContentfulPaintObserver();
    stopInitialLoadContextListeners();
  }
}

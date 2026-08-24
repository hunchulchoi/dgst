/** @typedef {{
 * fromPath?: string,
 * toPath?: string,
 * fromRouteId?: string,
 * toRouteId?: string,
 * type?: string,
 * operation?: string,
 * startedAt?: string
 * }} ClientNavigation */

/** @type {ClientNavigation | undefined} */
let activeNavigation;

/** @type {ClientNavigation | undefined} */
let lastNavigation;

/** @type {string | undefined} */
let lastSuccessfulPath;

/** @type {string | undefined} */
let pendingOperation;

const CLIENT_EVENT_TRACE_LIMIT = 16;

/** @type {Array<Record<string, string | number | boolean | undefined>>} */
let clientEventTrace = [];

let diagnosticsInstalled = false;

/** @param {unknown} value */
function safePath(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) return undefined;
  return value.split(/[?#]/, 1)[0].slice(0, 256);
}

/** @param {unknown} value */
function safeLabel(value) {
  return typeof value === 'string' && value ? value.slice(0, 128) : undefined;
}

/** @param {string} event @param {Record<string, unknown>} [details] */
function recordClientEvent(event, details = {}) {
  clientEventTrace.push({
    event: safeLabel(event),
    at: new Date().toISOString(),
    path: typeof location !== 'undefined' ? safePath(location.pathname) : safePath(details.path),
    visibility: typeof document !== 'undefined' ? safeLabel(document.visibilityState) : undefined,
    online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
    ...details
  });

  if (clientEventTrace.length > CLIENT_EVENT_TRACE_LIMIT) {
    clientEventTrace = clientEventTrace.slice(-CLIENT_EVENT_TRACE_LIMIT);
  }
}

/**
 * 브라우저 이벤트는 메모리에만 보관한다. 오류 보고가 발생할 때만 snapshot이 전송된다.
 */
export function installClientNavigationDiagnostics() {
  if (diagnosticsInstalled || typeof window === 'undefined') return;
  diagnosticsInstalled = true;

  recordClientEvent('diagnostics-installed');

  window.addEventListener('popstate', () => recordClientEvent('popstate'));
  window.addEventListener('online', () => recordClientEvent('online'));
  window.addEventListener('offline', () => recordClientEvent('offline'));
  window.addEventListener('pagehide', (event) =>
    recordClientEvent('pagehide', { persisted: event.persisted })
  );
  window.addEventListener('pageshow', (event) =>
    recordClientEvent('pageshow', { persisted: event.persisted })
  );
  document.addEventListener('visibilitychange', () => recordClientEvent('visibilitychange'));
}

export function getClientEventTrace() {
  return clientEventTrace.map((entry) => ({ ...entry }));
}

/**
 * 다음 SvelteKit navigation에 연결할 비식별 operation 이름을 지정한다.
 * @param {string} operation
 */
export function setClientNavigationOperation(operation) {
  pendingOperation = safeLabel(operation);
}

/** @param {ClientNavigation} navigation */
export function recordClientNavigationStart(navigation) {
  activeNavigation = {
    fromPath: safePath(navigation.fromPath) ?? lastSuccessfulPath,
    toPath: safePath(navigation.toPath),
    fromRouteId: safeLabel(navigation.fromRouteId),
    toRouteId: safeLabel(navigation.toRouteId),
    type: safeLabel(navigation.type),
    operation: safeLabel(navigation.operation) ?? pendingOperation ?? 'route-navigation',
    startedAt: new Date().toISOString()
  };
  lastNavigation = activeNavigation;
  pendingOperation = undefined;
  recordClientEvent('navigation-start', {
    fromPath: activeNavigation.fromPath,
    toPath: activeNavigation.toPath,
    navigationType: activeNavigation.type,
    operation: activeNavigation.operation
  });
}

/** @param {{ path?: string, routeId?: string }} destination */
export function recordClientNavigationComplete(destination = {}) {
  const completed = activeNavigation ?? lastNavigation ?? {};
  lastSuccessfulPath = safePath(destination.path) ?? completed.toPath ?? lastSuccessfulPath;
  lastNavigation = {
    ...completed,
    toPath: safePath(destination.path) ?? completed.toPath,
    toRouteId: safeLabel(destination.routeId) ?? completed.toRouteId
  };
  recordClientEvent('navigation-complete', {
    toPath: lastNavigation.toPath,
    navigationType: lastNavigation.type,
    operation: lastNavigation.operation
  });
  activeNavigation = undefined;
}

/**
 * URL query/hash는 알림 ID 등 불필요한 사용자 데이터를 포함할 수 있어 기록하지 않는다.
 * @param {{ currentPath?: string, targetPath?: string, routeId?: string }} [fallback]
 */
export function getClientNavigationContext(fallback = {}) {
  const navigation = activeNavigation ?? lastNavigation;
  const browserPath =
    typeof location !== 'undefined' ? safePath(location.pathname) : safePath(fallback.currentPath);

  return {
    currentPath: browserPath ?? safePath(fallback.currentPath) ?? navigation?.toPath,
    previousPath: navigation?.fromPath ?? lastSuccessfulPath,
    navigationFrom: navigation?.fromPath,
    navigationTo: navigation?.toPath ?? safePath(fallback.targetPath),
    navigationFromRouteId: navigation?.fromRouteId,
    navigationToRouteId: navigation?.toRouteId ?? safeLabel(fallback.routeId),
    navigationType: navigation?.type,
    operation: navigation?.operation ?? pendingOperation,
    navigationStartedAt: navigation?.startedAt,
    navigationActive: Boolean(activeNavigation)
  };
}

/** 테스트 격리용. */
export function resetClientNavigationContext() {
  activeNavigation = undefined;
  lastNavigation = undefined;
  lastSuccessfulPath = undefined;
  pendingOperation = undefined;
  clientEventTrace = [];
}

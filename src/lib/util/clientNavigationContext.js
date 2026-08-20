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

/** @param {unknown} value */
function safePath(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) return undefined;
  return value.slice(0, 256);
}

/** @param {unknown} value */
function safeLabel(value) {
  return typeof value === 'string' && value ? value.slice(0, 128) : undefined;
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
}

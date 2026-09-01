import { error, json } from '@sveltejs/kit';
import { checkRateLimit } from '$lib/server/apiRateLimit.js';
import logger from '$lib/util/logger.js';

const MAX_BODY_BYTES = 16 * 1024;

/**
 * @param {unknown} value
 * @param {number} depth
 * @returns {unknown}
 */
export function _sanitizeClientLogDetails(value, depth = 0) {
  if (value == null) return value;
  if (typeof value === 'string') return value.slice(0, 500);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    if (depth >= 3) return '[Array]';
    return value.slice(0, 20).map((item) => _sanitizeClientLogDetails(item, depth + 1));
  }
  if (typeof value === 'object') {
    if (depth >= 3) return '[Object]';
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [key, nested] of Object.entries(value).slice(0, 40)) {
      out[key.slice(0, 80)] = _sanitizeClientLogDetails(nested, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 500);
}

const NAVIGATION_NUMBER_FIELDS = [
  'dnsMs',
  'tcpMs',
  'tlsMs',
  'ttfbMs',
  'downloadMs',
  'domInteractiveMs',
  'domContentLoadedMs',
  'postDomLoadMs',
  'totalMs',
  'transferSize',
  'encodedBodySize',
  'decodedBodySize',
  'redirectCount'
];
const RESOURCE_NUMBER_FIELDS = ['durationMs', 'transferSize', 'encodedBodySize', 'decodedBodySize'];

/** @param {unknown} value */
function nonNegativeFinite(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** @param {unknown} value */
function sanitizeResourceName(value) {
  if (typeof value !== 'string') return undefined;
  const name = value.split(/[?#]/, 1)[0];
  return name.slice(0, 256);
}

/**
 * 성능 로그는 임의 객체를 그대로 저장하지 않고 진단에 필요한 필드만 허용한다.
 * @param {unknown} value
 */
export function _sanitizeClientPerformanceDetails(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const input = /** @type {Record<string, unknown>} */ (value);
  /** @type {Record<string, unknown>} */
  const output = {};

  if (
    input.navigation &&
    typeof input.navigation === 'object' &&
    !Array.isArray(input.navigation)
  ) {
    const navigationInput = /** @type {Record<string, unknown>} */ (input.navigation);
    /** @type {Record<string, unknown>} */
    const navigation = {};
    for (const field of NAVIGATION_NUMBER_FIELDS) {
      const sanitized = nonNegativeFinite(navigationInput[field]);
      if (sanitized !== undefined) navigation[field] = sanitized;
    }
    if (typeof navigationInput.protocol === 'string') {
      navigation.protocol = navigationInput.protocol.slice(0, 16);
    }
    if (typeof navigationInput.navigationType === 'string') {
      navigation.navigationType = navigationInput.navigationType.slice(0, 16);
    }
    if (Object.keys(navigation).length > 0) output.navigation = navigation;
  }

  if (Array.isArray(input.resources)) {
    output.resources = input.resources
      .slice(0, 5)
      .filter((resource) => resource && typeof resource === 'object' && !Array.isArray(resource))
      .map((resource) => {
        const resourceInput = /** @type {Record<string, unknown>} */ (resource);
        /** @type {Record<string, unknown>} */
        const sanitizedResource = {};
        const name = sanitizeResourceName(resourceInput.name);
        if (name) sanitizedResource.name = name;
        if (typeof resourceInput.initiatorType === 'string') {
          sanitizedResource.initiatorType = resourceInput.initiatorType.slice(0, 32);
        }
        for (const field of RESOURCE_NUMBER_FIELDS) {
          const sanitized = nonNegativeFinite(resourceInput[field]);
          if (sanitized !== undefined) sanitizedResource[field] = sanitized;
        }
        return sanitizedResource;
      });
  }

  if (input.longTasks && typeof input.longTasks === 'object' && !Array.isArray(input.longTasks)) {
    const longTaskInput = /** @type {Record<string, unknown>} */ (input.longTasks);
    /** @type {Record<string, unknown>} */
    const longTasks = {};
    for (const field of ['count', 'totalDurationMs', 'maxDurationMs']) {
      const sanitized = nonNegativeFinite(longTaskInput[field]);
      if (sanitized !== undefined) longTasks[field] = sanitized;
    }
    if (Array.isArray(longTaskInput.top)) {
      longTasks.top = longTaskInput.top
        .slice(0, 3)
        .filter((task) => task && typeof task === 'object' && !Array.isArray(task))
        .map((task) => {
          const taskInput = /** @type {Record<string, unknown>} */ (task);
          /** @type {Record<string, number>} */
          const sanitizedTask = {};
          for (const field of ['startTimeMs', 'durationMs']) {
            const sanitized = nonNegativeFinite(taskInput[field]);
            if (sanitized !== undefined) sanitizedTask[field] = sanitized;
          }
          return sanitizedTask;
        });
    }
    if (Object.keys(longTasks).length > 0) output.longTasks = longTasks;
  }

  return Object.keys(output).length > 0 ? output : undefined;
}

export async function POST(event) {
  const { request } = event;

  const rate = await checkRateLimit(event, {
    bucket: 'api-log',
    limit: 30,
    windowSeconds: 60
  });
  if (!rate.allowed) {
    throw error(429, { message: '요청이 너무 많습니다.' });
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    throw error(413, { message: '요청 본문이 너무 큽니다.' });
  }

  try {
    const logData = await request.json();

    const logLevel =
      logData.level === 'error' || logData.level === 'warn' || logData.level === 'info'
        ? logData.level
        : 'warn';
    const performanceDetails = _sanitizeClientPerformanceDetails(logData.performanceDetails);
    const logMessage = {
      message:
        typeof logData.message === 'string' ? logData.message.slice(0, 1000) : 'Client error',
      event: 'client.log',
      source: 'browser',
      timestamp: new Date().toISOString(),
      ...(typeof logData.type === 'string' && { type: logData.type.slice(0, 32) }),
      ...(typeof logData.pathname === 'string' && { pathname: logData.pathname.slice(0, 256) }),
      ...(typeof logData.from === 'string' && { from: logData.from.slice(0, 256) }),
      ...(typeof logData.to === 'string' && { to: logData.to.slice(0, 256) }),
      ...(Number.isFinite(logData.durationMs) && { durationMs: logData.durationMs }),
      ...(logData.slowLoad === true && { slowLoad: true }),
      ...(performanceDetails && { performanceDetails }),
      ...(logData.clientPageError === true && { clientPageError: true }),
      ...(Number.isFinite(logData.status) && { status: logData.status }),
      ...(typeof logData.errorMessage === 'string' && {
        errorMessage: logData.errorMessage.slice(0, 500)
      }),
      ...(typeof logData.trace === 'string' && { trace: logData.trace.slice(0, 8000) }),
      ...(typeof logData.errorName === 'string' && { errorName: logData.errorName.slice(0, 64) }),
      ...(typeof logData.cause === 'string' && { cause: logData.cause.slice(0, 1000) }),
      ...(typeof logData.routeId === 'string' && { routeId: logData.routeId.slice(0, 128) }),
      ...(typeof logData.viewport === 'string' && { viewport: logData.viewport.slice(0, 32) }),
      ...(typeof logData.filename === 'string' && { filename: logData.filename.slice(0, 512) }),
      ...(Number.isFinite(logData.lineno) && { lineno: logData.lineno }),
      ...(Number.isFinite(logData.colno) && { colno: logData.colno }),
      ...(typeof logData.chunkUrl === 'string' && { chunkUrl: logData.chunkUrl.slice(0, 512) }),
      ...(Number.isFinite(logData.chunkHttpStatus) && {
        chunkHttpStatus: logData.chunkHttpStatus
      }),
      ...(typeof logData.chunkHttpStatusText === 'string' && {
        chunkHttpStatusText: logData.chunkHttpStatusText.slice(0, 128)
      }),
      ...(typeof logData.chunkProbeError === 'string' && {
        chunkProbeError: logData.chunkProbeError.slice(0, 1000)
      }),
      ...(typeof logData.importTarget === 'string' && {
        importTarget: logData.importTarget.slice(0, 256)
      }),
      ...(typeof logData.phase === 'string' && { phase: logData.phase.slice(0, 64) }),
      ...(typeof logData.clientAt === 'string' && { clientAt: logData.clientAt.slice(0, 32) }),
      ...(typeof logData.errorId === 'string' && { errorId: logData.errorId.slice(0, 64) }),
      ...(typeof logData.fingerprint === 'string' && {
        fingerprint: logData.fingerprint.slice(0, 64)
      }),
      ...(typeof logData.buildVersion === 'string' && {
        buildVersion: logData.buildVersion.slice(0, 128)
      }),
      ...(typeof logData.component === 'string' && { component: logData.component.slice(0, 128) }),
      ...(typeof logData.operation === 'string' && { operation: logData.operation.slice(0, 128) }),
      ...(typeof logData.currentPath === 'string' && {
        currentPath: logData.currentPath.slice(0, 256)
      }),
      ...(typeof logData.previousPath === 'string' && {
        previousPath: logData.previousPath.slice(0, 256)
      }),
      ...(logData.details &&
        typeof logData.details === 'object' && {
          details: _sanitizeClientLogDetails(logData.details)
        })
    };

    // 로그 레벨에 따라 다른 logger 메서드 호출
    if (logLevel === 'error') {
      logger.error(logMessage);
    } else if (logLevel === 'warn') {
      logger.warn(logMessage);
    } else {
      logger.info(logMessage);
    }

    return json({ success: true });
  } catch (err) {
    logger.error({
      message: 'Failed to log client error',
      trace: err instanceof Error ? err.stack : String(err),
      error: err
    });
    return json({ success: false }, { status: 500 });
  }
}

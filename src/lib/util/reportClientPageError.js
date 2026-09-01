import { captureClientCallTrace, serializeError } from '$lib/util/formatErrorTrace.js';
import { version } from '$app/environment';

/** @typedef {Object} ClientPageErrorPayload
 * @property {number} status
 * @property {string} pathname
 * @property {string} [message]
 * @property {string} [stack]
 * @property {string} [name]
 * @property {unknown} [cause]
 * @property {string} [href]
 * @property {string} [search]
 * @property {string} [routeId]
 * @property {string} [referer]
 * @property {string} [errorId]
 * @property {string} [fingerprint]
 * @property {unknown} [error]
 * @property {Record<string, unknown>} [details]
 */

/** @typedef {Object} ClientErrorContext
 * @property {string} [type]
 * @property {string} [message]
 * @property {string} [pathname]
 * @property {string} [href]
 * @property {string} [search]
 * @property {string} [routeId]
 * @property {string} [referer]
 * @property {string} [errorId]
 * @property {string} [filename]
 * @property {number} [lineno]
 * @property {number} [colno]
 * @property {string} [chunkUrl]
 * @property {string} [importTarget]
 * @property {string} [phase]
 * @property {string} [fingerprint]
 * @property {string} [component]
 * @property {string} [operation]
 * @property {string} [currentPath]
 * @property {string} [previousPath]
 * @property {boolean} [clientPageError]
 * @property {number} [status]
 * @property {Record<string, unknown>} [details]
 * @property {'error' | 'warn' | 'info'} [level]
 */

const MAX_LEN = {
  message: 500,
  trace: 8000,
  routeId: 128,
  filename: 512,
  chunkUrl: 512,
  importTarget: 256,
  cause: 1000,
  phase: 64
};
const probedChunkUrls = new Set();

/** @param {string} value */
function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * 배포 hash, line/column, URL의 가변 부분을 제거해 같은 오류를 한 그룹으로 묶는다.
 * 원문이나 세션 값은 fingerprint에 포함하거나 전송하지 않는다.
 * @param {unknown} error
 * @param {{ routeId?: string, phase?: string, component?: string, operation?: string }} [context]
 */
export function createClientErrorFingerprint(error, context = {}) {
  const serialized = serializeError(error);
  const stackHead = (serialized?.stack ?? serialized?.trace ?? '')
    .split('\n')
    .slice(0, 6)
    .join('\n')
    .replace(/https?:\/\/[^\s)]+/g, '<url>')
    .replace(/\b[\w-]{8,}\.(?:js|mjs|svelte)\b/g, '<asset>')
    .replace(/\b[0-9a-f]{8,}\b/gi, '<id>')
    .replace(/:\d+:\d+/g, ':<line>:<col>')
    .replace(/\b\d{4,}\b/g, '<n>');
  const message = (serialized?.message ?? String(error ?? 'unknown'))
    .replace(/https?:\/\/[^\s)]+/g, '<url>')
    .replace(/\b[0-9a-f]{8,}\b/gi, '<id>')
    .replace(/\b\d{4,}\b/g, '<n>');
  const signature = [
    serialized?.name ?? 'Error',
    message,
    stackHead,
    context.routeId ?? '',
    context.phase ?? '',
    context.component ?? '',
    context.operation ?? ''
  ].join('|');
  return `ce-${fnv1a(signature)}`;
}

export function createClientErrorId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // 제한된 WebView에서는 시간/난수 fallback 사용
  }
  return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 앱은 Web Serial을 사용하지 않는다. 이 오류는 Windows Chrome 확장 프로그램이나
 * 주입 스크립트가 직렬 포트를 열지 못했을 때 페이지의 전역 rejection으로 전달된다.
 * @param {unknown} error
 */
export function isExternalSerialPortError(error) {
  const candidate =
    error && typeof error === 'object'
      ? /** @type {{ name?: unknown; message?: unknown }} */ (error)
      : null;
  const name = typeof candidate?.name === 'string' ? candidate.name : '';
  const message =
    typeof candidate?.message === 'string'
      ? candidate.message
      : typeof error === 'string'
        ? error
        : '';

  return (
    name === 'NetworkError' &&
    message.includes("Failed to execute 'open' on 'SerialPort'") &&
    message.includes('Failed to open serial port')
  );
}

/**
 * @param {string | undefined} value
 * @param {number} max
 */
function clip(value, max) {
  if (typeof value !== 'string' || !value) return undefined;
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * @param {unknown} value
 * @returns {string | undefined}
 */
function stringifyCause(value) {
  if (value == null) return undefined;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const parsed = /** @type {{ name?: unknown, message?: unknown }} */ (value);
    if (typeof parsed.message === 'string') {
      return `${typeof parsed.name === 'string' ? parsed.name : 'Error'}: ${parsed.message}`;
    }
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Safari/Chromium dynamic import errors often include the failed chunk URL in the message.
 * @param {string | undefined} message
 * @returns {string | undefined}
 */
function inferChunkUrl(message) {
  if (!message) return undefined;
  const match = message.match(/(?:https?:\/\/|\/)[^\s"'<>)]*_app\/immutable\/[^\s"'<>)]*/);
  return match?.[0];
}

/**
 * 오류 메시지의 URL을 그대로 요청하지 않는다. 현재 origin의 SvelteKit chunk만 진단한다.
 * @param {string | undefined} chunkUrl
 */
function getProbeableChunkUrl(chunkUrl) {
  if (!chunkUrl || typeof location === 'undefined') return undefined;
  try {
    const url = new URL(chunkUrl, location.origin);
    if (url.origin !== location.origin || !url.pathname.startsWith('/_app/immutable/'))
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

/**
 * 해시 chunk 실패는 배포 불일치(404)와 네트워크 오류를 구분해야 한다.
 * 같은 URL은 페이지 수명 동안 한 번만 probe한다.
 * @param {string | undefined} chunkUrl
 * @param {{ pathname?: string, routeId?: string, fingerprint?: string, buildVersion?: string }} context
 */
async function reportChunkProbe(chunkUrl, context) {
  const probeUrl = getProbeableChunkUrl(chunkUrl);
  if (!probeUrl || probedChunkUrls.has(probeUrl) || typeof fetch !== 'function') return;
  probedChunkUrls.add(probeUrl);

  /** @type {{ chunkHttpStatus?: number, chunkHttpStatusText?: string, chunkProbeError?: string }} */
  let result;
  try {
    const response = await fetch(probeUrl, {
      method: 'HEAD',
      cache: 'no-store',
      credentials: 'same-origin'
    });
    result = {
      chunkHttpStatus: response.status,
      chunkHttpStatusText: response.statusText.slice(0, 128)
    };
  } catch (error) {
    result = { chunkProbeError: clip(stringifyCause(error), MAX_LEN.cause) };
  }

  try {
    void fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        level: 'warn',
        message: '[module-chunk-probe] module script load diagnostic',
        type: 'module-chunk-probe',
        chunkUrl,
        pathname: context.pathname,
        routeId: context.routeId,
        fingerprint: context.fingerprint,
        buildVersion: context.buildVersion,
        clientAt: new Date().toISOString(),
        ...result
      })
    }).catch(() => {});
  } catch {
    // 진단 로그 실패가 원래 오류 흐름을 방해하지 않음
  }
}

/**
 * SvelteKit이 500의 본문을 Internal Error로 숨겨도 당시 브라우저 상태와 전달된
 * App.Error의 형태는 남긴다. 값 자체 대신 키/유무만 기록해 민감정보 노출을 피한다.
 * @param {unknown} pageError
 * @returns {Record<string, unknown>}
 */
function collectPageErrorDiagnostics(pageError) {
  const parsed =
    pageError && typeof pageError === 'object'
      ? /** @type {Record<string, unknown>} */ (pageError)
      : undefined;
  const nav =
    typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function'
      ? /** @type {{ type?: string } | undefined} */ (performance.getEntriesByType('navigation')[0])
      : undefined;
  const connection =
    typeof navigator !== 'undefined'
      ? /** @type {{ effectiveType?: string; rtt?: number; downlink?: number; saveData?: boolean } | undefined} */ (
          /** @type {Navigator & { connection?: unknown }} */ (navigator).connection
        )
      : undefined;
  const browserNavigator =
    typeof navigator !== 'undefined'
      ? /** @type {Navigator & { deviceMemory?: number }} */ (navigator)
      : undefined;

  return {
    pageErrorType: pageError == null ? String(pageError) : typeof pageError,
    pageErrorKeys: parsed ? Object.getOwnPropertyNames(parsed).sort().slice(0, 20) : [],
    pageErrorHasStack: typeof parsed?.stack === 'string' && parsed.stack.length > 0,
    pageErrorHasCause: parsed?.cause != null,
    documentReadyState: typeof document !== 'undefined' ? document.readyState : undefined,
    visibilityState: typeof document !== 'undefined' ? document.visibilityState : undefined,
    online: browserNavigator?.onLine,
    navigationType: nav?.type,
    effectiveType: connection?.effectiveType,
    connectionRttMs: connection?.rtt,
    downlinkMbps: connection?.downlink,
    saveData: connection?.saveData,
    screen:
      typeof window !== 'undefined' && window.screen
        ? `${window.screen.width}x${window.screen.height}`
        : undefined,
    pixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : undefined,
    historyLength: typeof window !== 'undefined' ? window.history?.length : undefined,
    hardwareConcurrency: browserNavigator?.hardwareConcurrency,
    deviceMemoryGb: browserNavigator?.deviceMemory,
    serviceWorkerControlled:
      typeof navigator !== 'undefined' && 'serviceWorker' in navigator
        ? Boolean(navigator.serviceWorker?.controller)
        : undefined
  };
}

/** @param {unknown} value */
function extractPageErrorId(value) {
  if (!value || typeof value !== 'object') return undefined;
  const parsed = /** @type {{ errorId?: unknown; body?: { errorId?: unknown } }} */ (value);
  if (typeof parsed.errorId === 'string') return clip(parsed.errorId, 64);
  return typeof parsed.body?.errorId === 'string' ? clip(parsed.body.errorId, 64) : undefined;
}

/**
 * 클라이언트 런타임 에러를 상세 컨텍스트와 함께 서버 로그로 전송한다.
 * @param {unknown} error
 * @param {ClientErrorContext} context
 */
export function reportClientError(error, context = {}) {
  const serialized = serializeError(error);
  const fallbackMessage = error == null ? 'Unknown client error' : String(error);
  const errorName = clip(serialized?.name, 64);
  const errorMessage =
    clip(serialized?.message, MAX_LEN.message) ??
    clip(context.message, MAX_LEN.message) ??
    fallbackMessage;

  const safePathname =
    clip(context.pathname, 256) ??
    (typeof location !== 'undefined' ? clip(location.pathname, 256) : undefined);
  const safeRouteId = clip(context.routeId, MAX_LEN.routeId);
  const viewport =
    typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : undefined;
  const clientAt = new Date().toISOString();
  const chunkUrl =
    clip(context.chunkUrl, MAX_LEN.chunkUrl) ?? inferChunkUrl(serialized?.message ?? errorMessage);
  const filename = clip(context.filename, MAX_LEN.filename);
  const cause = clip(stringifyCause(serialized?.cause), MAX_LEN.cause);
  const trace =
    clip(
      serialized?.trace || captureClientCallTrace(context.type ?? 'client-error'),
      MAX_LEN.trace
    ) ?? '';

  const type = clip(context.type, 64) ?? 'client-error';
  const component = clip(context.component, 128);
  const operation = clip(context.operation, 128);
  const currentPath = clip(context.currentPath, 256) ?? safePathname;
  const previousPath = clip(context.previousPath, 256);
  const fingerprint =
    clip(context.fingerprint, 64) ??
    createClientErrorFingerprint(error, {
      routeId: safeRouteId,
      phase: context.phase,
      component,
      operation
    });
  const details =
    context.details && typeof context.details === 'object' ? context.details : undefined;
  const summary = `[${type}] ${context.message ?? errorMessage}`;
  const detailParts = [
    errorName && `name=${errorName}`,
    `msg=${errorMessage}`,
    context.errorId && `errorId=${context.errorId}`,
    fingerprint && `fingerprint=${fingerprint}`,
    safePathname && `path=${safePathname}`,
    safeRouteId && `route=${safeRouteId}`,
    chunkUrl && `chunk=${chunkUrl}`,
    filename && `file=${filename}`,
    Number.isFinite(context.lineno) && `line=${context.lineno}`,
    Number.isFinite(context.colno) && `col=${context.colno}`,
    viewport && `viewport=${viewport}`,
    `clientAt=${clientAt}`
  ].filter((part) => typeof part === 'string');
  const logLine = `${summary} | ${detailParts.join(' | ')}`;
  const level = context.level ?? 'error';

  if (level === 'info') {
    console.info(logLine);
  } else if (level === 'warn') {
    console.warn(logLine, error);
  } else {
    console.error(logLine, error);
  }
  if (trace) {
    const traceLine = `[${type}] trace:\n${trace}`;
    if (level === 'info') console.info(traceLine);
    else if (level === 'warn') console.warn(traceLine);
    else console.error(traceLine);
  }

  try {
    void fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        level: context.level ?? 'error',
        message: logLine,
        type,
        ...(context.clientPageError === true && { clientPageError: true }),
        ...(Number.isFinite(context.status) && { status: context.status }),
        ...(safePathname && { pathname: safePathname }),
        errorMessage,
        trace,
        ...(errorName && { errorName }),
        ...(cause && { cause }),
        ...(safeRouteId && { routeId: safeRouteId }),
        ...(viewport && { viewport }),
        ...(filename && { filename }),
        ...(Number.isFinite(context.lineno) && { lineno: context.lineno }),
        ...(Number.isFinite(context.colno) && { colno: context.colno }),
        ...(chunkUrl && { chunkUrl }),
        ...(clip(context.importTarget, MAX_LEN.importTarget) && {
          importTarget: clip(context.importTarget, MAX_LEN.importTarget)
        }),
        ...(clip(context.phase, MAX_LEN.phase) && { phase: clip(context.phase, MAX_LEN.phase) }),
        ...(context.errorId && { errorId: context.errorId }),
        fingerprint,
        buildVersion: version,
        ...(component && { component }),
        ...(operation && { operation }),
        ...(currentPath && { currentPath }),
        ...(previousPath && { previousPath }),
        ...(details && { details }),
        clientAt
      })
    }).catch(() => {});
    void reportChunkProbe(chunkUrl, {
      pathname: safePathname,
      routeId: safeRouteId,
      fingerprint,
      buildVersion: version
    });
  } catch {
    // 로깅 실패는 사용자 흐름을 방해하지 않음
  }
}

/**
 * 에러 페이지(500 등) 노출 시 클라이언트에서 서버 로그로 전송한다.
 * @param {ClientPageErrorPayload} payload
 */
export function reportClientPageError(payload) {
  const {
    status,
    pathname,
    message,
    stack,
    name,
    cause,
    href,
    search,
    routeId,
    referer,
    error,
    fingerprint: payloadFingerprint,
    details
  } = payload;

  if (!Number.isFinite(status) || status < 500) return;

  const parsedError =
    error && typeof error === 'object'
      ? /** @type {{ message?: unknown; stack?: unknown; name?: unknown; cause?: unknown; fingerprint?: unknown }} */ (
          error
        )
      : undefined;
  const errorId = clip(payload.errorId, 64) ?? extractPageErrorId(error);
  const fingerprint =
    clip(payloadFingerprint, 64) ??
    (typeof parsedError?.fingerprint === 'string' ? clip(parsedError.fingerprint, 64) : undefined);
  const resolvedMessage =
    message ?? (typeof parsedError?.message === 'string' ? parsedError.message : undefined);
  const errorMessage = clip(resolvedMessage, MAX_LEN.message) ?? '알 수 없는 오류';
  const pageDiagnostics = collectPageErrorDiagnostics(error);
  const summaryParts = [
    `[client-page-error] errorId=${errorId ?? 'missing'} ${status} ${pathname}`,
    routeId && `route=${routeId}`,
    pageDiagnostics.documentReadyState && `ready=${pageDiagnostics.documentReadyState}`,
    pageDiagnostics.navigationType && `nav=${pageDiagnostics.navigationType}`,
    typeof pageDiagnostics.online === 'boolean' && `online=${pageDiagnostics.online}`
  ].filter((part) => typeof part === 'string');
  const summary = summaryParts.join(' | ');

  reportClientError(
    error ?? {
      name: name ?? (typeof parsedError?.name === 'string' ? parsedError.name : undefined),
      message: errorMessage,
      stack: stack ?? (typeof parsedError?.stack === 'string' ? parsedError.stack : undefined),
      cause: cause ?? parsedError?.cause
    },
    {
      type: 'page-error',
      message: summary,
      clientPageError: true,
      status,
      pathname,
      href,
      search,
      referer,
      routeId,
      errorId,
      fingerprint,
      phase: 'page-render',
      component: '+error.svelte',
      operation: typeof details?.operation === 'string' ? details.operation : 'error-page-render',
      currentPath: typeof details?.currentPath === 'string' ? details.currentPath : pathname,
      previousPath: typeof details?.previousPath === 'string' ? details.previousPath : undefined,
      details: { ...pageDiagnostics, ...details }
    }
  );
}

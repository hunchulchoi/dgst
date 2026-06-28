import { captureClientCallTrace, serializeError } from '$lib/util/formatErrorTrace.js';

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
 * @property {boolean} [clientPageError]
 * @property {number} [status]
 * @property {Record<string, unknown>} [details]
 * @property {'error' | 'warn' | 'info'} [level]
 */

const MAX_LEN = {
  message: 500,
  trace: 8000,
  href: 512,
  referer: 512,
  routeId: 128,
  search: 256,
  userAgent: 512,
  filename: 512,
  chunkUrl: 512,
  importTarget: 256,
  platform: 128,
  language: 64,
  cause: 1000,
  phase: 64
};

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

  const safeHref =
    clip(context.href, MAX_LEN.href) ??
    (typeof location !== 'undefined' ? clip(location.href, MAX_LEN.href) : undefined);
  const safePathname =
    clip(context.pathname, 256) ??
    (typeof location !== 'undefined' ? clip(location.pathname, 256) : undefined);
  const safeSearch =
    clip(context.search, MAX_LEN.search) ??
    (typeof location !== 'undefined' ? clip(location.search, MAX_LEN.search) : undefined);
  const safeReferer =
    clip(context.referer, MAX_LEN.referer) ??
    (typeof document !== 'undefined' ? clip(document.referrer, MAX_LEN.referer) : undefined);
  const safeRouteId = clip(context.routeId, MAX_LEN.routeId);
  const userAgent =
    typeof navigator !== 'undefined' ? clip(navigator.userAgent, MAX_LEN.userAgent) : undefined;
  const platform =
    typeof navigator !== 'undefined' ? clip(navigator.platform, MAX_LEN.platform) : undefined;
  const language =
    typeof navigator !== 'undefined' ? clip(navigator.language, MAX_LEN.language) : undefined;
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
  const details = context.details && typeof context.details === 'object' ? context.details : undefined;
  const summary = `[${type}] ${context.message ?? errorMessage}`;
  const detailParts = [
    errorName && `name=${errorName}`,
    `msg=${errorMessage}`,
    context.errorId && `errorId=${context.errorId}`,
    safePathname && `path=${safePathname}`,
    safeRouteId && `route=${safeRouteId}`,
    chunkUrl && `chunk=${chunkUrl}`,
    filename && `file=${filename}`,
    Number.isFinite(context.lineno) && `line=${context.lineno}`,
    Number.isFinite(context.colno) && `col=${context.colno}`,
    platform && `platform=${platform}`,
    language && `lang=${language}`,
    viewport && `viewport=${viewport}`,
    userAgent && `ua=${userAgent}`,
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
        ...(safeHref && { href: safeHref }),
        ...(safeSearch && { search: safeSearch }),
        ...(safeReferer && { referer: safeReferer }),
        ...(safeRouteId && { routeId: safeRouteId }),
        ...(viewport && { viewport }),
        ...(userAgent && { userAgent }),
        ...(platform && { platform }),
        ...(language && { language }),
        ...(filename && { filename }),
        ...(Number.isFinite(context.lineno) && { lineno: context.lineno }),
        ...(Number.isFinite(context.colno) && { colno: context.colno }),
        ...(chunkUrl && { chunkUrl }),
        ...(clip(context.importTarget, MAX_LEN.importTarget) && {
          importTarget: clip(context.importTarget, MAX_LEN.importTarget)
        }),
        ...(clip(context.phase, MAX_LEN.phase) && { phase: clip(context.phase, MAX_LEN.phase) }),
        ...(context.errorId && { errorId: context.errorId }),
        ...(details && { details }),
        clientAt
      })
    }).catch(() => {});
  } catch {
    // 로깅 실패는 사용자 흐름을 방해하지 않음
  }
}

/**
 * 에러 페이지(500 등) 노출 시 클라이언트에서 서버 로그로 전송한다.
 * @param {ClientPageErrorPayload} payload
 */
export function reportClientPageError(payload) {
  const { status, pathname, message, stack, name, cause, href, search, routeId, referer, errorId } =
    payload;

  if (!Number.isFinite(status) || status < 500) return;

  const errorMessage = clip(message, MAX_LEN.message) ?? '알 수 없는 오류';
  const summary = errorId
    ? `[client-page-error] errorId=${errorId} ${status} ${pathname}`
    : `[client-page-error] ${status} ${pathname}`;

  reportClientError(
    { name, message: errorMessage, stack, cause },
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
      phase: 'page-render'
    }
  );
}

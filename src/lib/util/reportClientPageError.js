import { captureClientCallTrace, formatErrorTrace } from '$lib/util/formatErrorTrace.js';

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

const MAX_LEN = {
  message: 500,
  trace: 8000,
  href: 512,
  referer: 512,
  routeId: 128,
  search: 256,
  userAgent: 256
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
 * 에러 페이지(500 등) 노출 시 클라이언트에서 서버 로그로 전송한다.
 * @param {ClientPageErrorPayload} payload
 */
export function reportClientPageError(payload) {
  const { status, pathname, message, stack, name, cause, href, search, routeId, referer, errorId } =
    payload;

  if (!Number.isFinite(status) || status < 500) return;

  const errorMessage = clip(message, MAX_LEN.message) ?? '알 수 없는 오류';
  const safeHref = clip(href, MAX_LEN.href);
  const safeSearch = clip(search, MAX_LEN.search);
  const safeReferer = clip(referer, MAX_LEN.referer);
  const safeRouteId = clip(routeId, MAX_LEN.routeId);
  const userAgent =
    typeof navigator !== 'undefined' ? clip(navigator.userAgent, MAX_LEN.userAgent) : undefined;
  const viewport =
    typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : undefined;
  const clientAt = new Date().toISOString();

  let trace = formatErrorTrace({
    name,
    message: errorMessage,
    stack,
    cause
  });

  if (!stack) {
    const captured = captureClientCallTrace('client-page-error');
    if (captured) {
      trace = trace ? `${trace}\n--- client capture ---\n${captured}` : captured;
    }
  }

  trace = clip(trace, MAX_LEN.trace) ?? '';

  const detailParts = [
    `msg=${errorMessage}`,
    errorId && `errorId=${errorId}`,
    name && `name=${name}`,
    safeHref && `href=${safeHref}`,
    safeSearch && `search=${safeSearch}`,
    safeReferer && `referer=${safeReferer}`,
    safeRouteId && `route=${safeRouteId}`,
    viewport && `viewport=${viewport}`,
    userAgent && `ua=${userAgent}`,
    `clientAt=${clientAt}`
  ].filter((part) => typeof part === 'string');

  const summary = errorId
    ? `[client-page-error] errorId=${errorId} ${status} ${pathname}`
    : `[client-page-error] ${status} ${pathname}`;
  const logLine = `${summary} | ${detailParts.join(' | ')}`;

  console.error(logLine);
  if (trace) {
    console.error(`[client-page-error] trace:\n${trace}`);
  }

  try {
    void fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        level: 'error',
        message: logLine,
        clientPageError: true,
        type: 'page-error',
        status,
        pathname,
        errorMessage,
        trace,
        ...(errorId && { errorId }),
        ...(name && { errorName: name }),
        ...(safeHref && { href: safeHref }),
        ...(safeSearch && { search: safeSearch }),
        ...(safeReferer && { referer: safeReferer }),
        ...(safeRouteId && { routeId: safeRouteId }),
        ...(viewport && { viewport }),
        ...(userAgent && { userAgent }),
        clientAt
      })
    });
  } catch {
    // 로깅 실패는 사용자 흐름을 방해하지 않음
  }
}

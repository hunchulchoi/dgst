/** @typedef {Object} ClientPageErrorPayload
 * @property {number} status
 * @property {string} pathname
 * @property {string} [message]
 */

/**
 * 에러 페이지(500 등) 노출 시 클라이언트에서 서버 로그로 전송한다.
 * @param {ClientPageErrorPayload} payload
 */
export function reportClientPageError(payload) {
  const { status, pathname, message } = payload;

  if (!Number.isFinite(status) || status < 500) return;

  const summary = `[client-page-error] ${status} ${pathname}`;
  const errorMessage =
    typeof message === 'string' ? message.slice(0, 500) : '알 수 없는 오류';

  console.error(summary, { message: errorMessage });

  try {
    void fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        level: 'error',
        message: `${summary}: ${errorMessage}`,
        clientPageError: true,
        type: 'page-error',
        status,
        pathname,
        errorMessage
      })
    });
  } catch {
    // 로깅 실패는 사용자 흐름을 방해하지 않음
  }
}

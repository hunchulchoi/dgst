import { error, json } from '@sveltejs/kit';
import { checkRateLimit } from '$lib/server/apiRateLimit.js';
import logger from '$lib/util/logger.js';

const MAX_BODY_BYTES = 8 * 1024;

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

    const logLevel = logData.level === 'error' || logData.level === 'warn' ? logData.level : 'warn';
    const logMessage = {
      message: typeof logData.message === 'string' ? logData.message.slice(0, 500) : 'Client error',
      level: logLevel,
      client: true,
      userAgent: request.headers.get('user-agent'),
      timestamp: new Date().toISOString(),
      ...(typeof logData.type === 'string' && { type: logData.type.slice(0, 32) }),
      ...(typeof logData.pathname === 'string' && { pathname: logData.pathname.slice(0, 256) }),
      ...(typeof logData.from === 'string' && { from: logData.from.slice(0, 256) }),
      ...(typeof logData.to === 'string' && { to: logData.to.slice(0, 256) }),
      ...(Number.isFinite(logData.durationMs) && { durationMs: logData.durationMs }),
      ...(logData.slowLoad === true && { slowLoad: true }),
      ...(logData.clientPageError === true && { clientPageError: true }),
      ...(Number.isFinite(logData.status) && { status: logData.status }),
      ...(typeof logData.errorMessage === 'string' && {
        errorMessage: logData.errorMessage.slice(0, 500)
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
      error: err
    });
    return json({ success: false }, { status: 500 });
  }
}

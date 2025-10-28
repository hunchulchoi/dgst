import { json } from '@sveltejs/kit';
import logger from '$lib/util/logger.js';

export async function POST({ request }) {
  try {
    const logData = await request.json();

    const logLevel = logData.level || 'warn';
    const logMessage = {
      message: logData.message || 'Client error',
      ...logData,
      client: true,
      userAgent: request.headers.get('user-agent'),
      timestamp: new Date().toISOString()
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
      error: err.message,
      stack: err.stack
    });
    return json({ success: false }, { status: 500 });
  }
}


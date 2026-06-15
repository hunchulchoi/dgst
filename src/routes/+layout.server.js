import { env as dynamicEnv } from '$env/dynamic/private';
import { getUnreadAlarmCount } from '$lib/server/alarm/alarmService.js';
import { isBoardHtmlPath } from '$lib/util/boardPaths.js';
import logger from '$lib/util/logger.js';
import { traceFromUnknown } from '$lib/util/formatErrorTrace.js';

export const load = async (event) => {
  const boardRoute = isBoardHtmlPath(event.url.pathname);

  try {
    event.setHeaders(
      boardRoute
        ? {
            'Cache-Control': 'private, no-store, must-revalidate, max-age=0',
            'CDN-Cache-Control': 'no-store'
          }
        : {
            'Cache-Control': 'private, no-cache'
          }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (!message.includes('already set')) {
      throw err;
    }
  }

  /** @type {import('@auth/sveltekit').Session | null} */
  let session = null;
  try {
    session = await event.locals.auth();
  } catch (err) {
    logger.warn({
      message: '[layout] auth() failed — continuing without session',
      pathname: event.url.pathname,
      errorMessage: err instanceof Error ? err.message : String(err),
      trace: traceFromUnknown(err)
    });
  }

  let unreadAlarmCount = 0;
  if (session?.user?.email) {
    unreadAlarmCount = await getUnreadAlarmCount(session.user.email);
  }

  const kakaoId =
    dynamicEnv.KAKAO_CLIENT_ID ??
    (typeof process !== 'undefined' ? process.env?.KAKAO_CLIENT_ID : undefined);
  const kakaoSecret =
    dynamicEnv.KAKAO_CLIENT_SECRET ??
    (typeof process !== 'undefined' ? process.env?.KAKAO_CLIENT_SECRET : undefined);
  const kakaoEnabled = !!(kakaoId && kakaoSecret);

  return {
    session,
    unreadAlarmCount,
    kakaoEnabled
  };
};

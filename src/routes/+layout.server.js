import { env as dynamicEnv } from '$env/dynamic/private';
import { isBoardHtmlPath } from '$lib/util/boardPaths.js';

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

  const session = await event.locals.auth();
  const kakaoId =
    dynamicEnv.KAKAO_CLIENT_ID ??
    (typeof process !== 'undefined' ? process.env?.KAKAO_CLIENT_ID : undefined);
  const kakaoSecret =
    dynamicEnv.KAKAO_CLIENT_SECRET ??
    (typeof process !== 'undefined' ? process.env?.KAKAO_CLIENT_SECRET : undefined);
  const kakaoEnabled = !!(kakaoId && kakaoSecret);

  return {
    session,
    kakaoEnabled
  };
};

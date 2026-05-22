import { env as dynamicEnv } from '$env/dynamic/private';

export const load = async (event) => {
  try {
    event.setHeaders({
      'Cache-Control': 'private, no-cache'
    });
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

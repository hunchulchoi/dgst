import { redirect } from '@sveltejs/kit';
import logger from '$lib/util/logger';

export async function load(event) {
  const session = await event.locals.auth();
  if (session?.user?.nickname) {
    throw redirect(302, '/');
  }
  const errorParam = event.url.searchParams.get('error');
  if (errorParam) {
    logger.error({
      message: '로그인 실패 확인 (클라이언트 에러 파라미터)',
      error: errorParam,
      ip: event.getClientAddress()
    });
  }

  return { error: errorParam };
}

import { error } from '@sveltejs/kit';

import logger from '#lib/util/logger.js';

/**
 * @param {{ request: Request, locals: App.Locals }} event
 * @returns {Promise<string>} the signed-in user's email
 */
export async function requireBoardUploadUser({ request, locals }) {
  const session = await locals.auth();
  const email = typeof session?.user?.email === 'string' ? session.user.email : '';

  if (!session?.user?.nickname || !email) {
    logger.warn({
      message: 'Image upload failed - unauthorized',
      pathname: request.url,
      user: email || 'anonymous'
    });
    throw error(401, '로그인 해 주세요');
  }
  return email;
}

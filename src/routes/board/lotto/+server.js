import connectDB from '$lib/database/mongoosePriomise.js';
import { json, error, isHttpError } from '@sveltejs/kit';
import { z } from 'zod';
import logger from '$lib/util/logger.js';
import { GameLog } from '$lib/models/gameLog.js';
import { generateLottoNumbers } from '$lib/server/lotto.js';

connectDB();

const lottoPostBodySchema = z.object({}).strict();

/**
 * 인생역전(임의 번호): 로그인 사용자만 저장
 */
export async function POST({ locals, request }) {
  try {
    const session = await locals.auth();
    if (!session?.user?.email) {
      throw error(401, { message: '로그인이 필요합니다.' });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const parsed = await lottoPostBodySchema.safeParseAsync(body);

    if (!parsed.success) {
      throw error(400, { message: '유효하지 않은 요청 형식입니다.' });
    }

    const email = session.user.email;
    const nickname =
      typeof session.user === 'object' &&
      'nickname' in session.user &&
      typeof session.user.nickname === 'string' &&
      session.user.nickname.trim()
        ? session.user.nickname.trim()
        : 'anonymous';

    const numbers = generateLottoNumbers();

    await GameLog.create({
      game: 'lotto',
      action: 'pick',
      email,
      meta: { nickname, numbers }
    });

    return json({ success: true, numbers });
  } catch (err) {
    if (isHttpError(err)) throw err;
    logger.error({ message: 'lotto POST failed', err });
    throw error(500, { message: '번호 생성 중 오류가 발생했습니다.' });
  }
}

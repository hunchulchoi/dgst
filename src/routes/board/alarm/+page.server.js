import { error } from '@sveltejs/kit';
import { getAlarmList } from '$lib/server/redis/alarmService.js';
import logger from '$lib/util/logger.js';

// 캐시 방지 - 항상 최신 데이터 로드
export const load = async ({ locals, depends }) => {
  depends('alarm-list');

  try {
    const session = await locals.auth();

    if (!session?.user?.nickname) {
      throw error(401, { message: '로그인이 필요합니다.' });
    }

    if (!session.user.email) {
      return { alarms: [] };
    }

    const alarms = await getAlarmList(session.user.email, 30);
    return { alarms };
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) {
      throw err;
    }

    logger.error({
      message: '[alarm page] load failed',
      errorMessage: err instanceof Error ? err.message : String(err)
    });
    return { alarms: [] };
  }
};

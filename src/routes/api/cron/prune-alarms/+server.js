import { json } from '@sveltejs/kit';
import { env as dynamicEnv } from '$env/dynamic/private';
import { pruneExpiredAlarms } from '$lib/server/alarm/alarmService.js';

/**
 * 3일(ALARM_TTL)보다 오래된 알람 삭제.
 *
 * 예: curl -H "x-cron-secret: YOUR_CRON_SECRET" "https://your-domain/api/cron/prune-alarms"
 */
export async function GET({ request }) {
  const secret = dynamicEnv.CRON_SECRET;
  const given = request.headers.get('x-cron-secret');

  if (!secret || given !== secret) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const deletedCount = await pruneExpiredAlarms();
    return json({
      ok: true,
      deletedCount,
      message: '3일 이상 지난 알람이 삭제되었습니다.',
      at: new Date().toISOString()
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Prune failed';
    return json({ ok: false, error: errorMessage, at: new Date().toISOString() }, { status: 500 });
  }
}

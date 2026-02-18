import { json } from '@sveltejs/kit';
import { env as dynamicEnv } from '$env/dynamic/private';
import connectDB from '$lib/database/mongoosePriomise.js';
import { Alarm } from '$lib/models/alarm.js';

connectDB();

/**
 * 빈 알림(comments가 빈 배열인 문서) 주기 정리용 배치 엔드포인트.
 * 시스템 cron 등에서 CRON_SECRET으로 호출한다.
 *
 * 예: curl -H "x-cron-secret: YOUR_CRON_SECRET" "https://your-domain/api/cron/cleanup-empty-alarms"
 */
export async function GET({ request }) {
  const secret = dynamicEnv.CRON_SECRET;
  const given = request.headers.get('x-cron-secret');

  if (!secret || given !== secret) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await Alarm.deleteMany({
      comments: { $exists: true, $eq: [] }
    });
    return json({
      ok: true,
      deletedCount: result.deletedCount,
      at: new Date().toISOString()
    });
  } catch (err) {
    return json(
      { ok: false, error: err?.message ?? 'Delete failed', at: new Date().toISOString() },
      { status: 500 }
    );
  }
}

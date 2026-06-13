import { json } from '@sveltejs/kit';
import { getUnreadAlarmCount } from '$lib/server/alarm/alarmService.js';

/** 헤더 알림 뱃지용 (레이아웃 blocking 제거) */
export async function GET({ locals }) {
  try {
    const session = await locals.auth();
    if (!session?.user?.email) {
      return json({ count: 0 });
    }

    const count = await getUnreadAlarmCount(session.user.email);
    return json({ count }, { headers: { 'Cache-Control': 'private, no-cache' } });
  } catch (err) {
    console.error('unread alarm count failed', err);
    return json({ count: 0 }, { status: 500 });
  }
}

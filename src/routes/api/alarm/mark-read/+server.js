import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { getUnreadAlarmCount, markAsRead } from '$lib/server/alarm/alarmService.js';

const bodySchema = z.object({
  articleId: z.string().min(1)
});

/**
 * 게시글 열람 시 해당 글 알림 읽음 처리 + 미읽음 개수 반환
 */
export async function POST({ locals, request }) {
  try {
    const session = await locals.auth();
    if (!session?.user?.email) {
      return json({ count: 0 }, { status: 401 });
    }

    let parsed;
    try {
      const body = await request.json();
      parsed = bodySchema.safeParse(body);
    } catch {
      return json({ message: '잘못된 요청입니다.' }, { status: 400 });
    }

    if (!parsed.success) {
      return json({ message: 'articleId가 필요합니다.' }, { status: 400 });
    }

    const { articleId } = parsed.data;
    await markAsRead(session.user.email, articleId);
    const count = await getUnreadAlarmCount(session.user.email);

    return json({ count }, { headers: { 'Cache-Control': 'private, no-cache' } });
  } catch (err) {
    console.error('alarm mark-read failed', err);
    return json({ count: 0 }, { status: 500 });
  }
}

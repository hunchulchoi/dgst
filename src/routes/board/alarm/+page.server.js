import { error } from '@sveltejs/kit';
import { Alarm } from '$lib/models/alarm.js';
import connectDB from '$lib/database/mongoosePriomise.js';

connectDB();

// 캐시 방지 - 항상 최신 데이터 로드
export const load = async ({ locals, depends }) => {
  const loadStartTime = Date.now();
  const timestamp = new Date().toISOString();

  console.log('🔔 [알림 페이지] load 함수 시작:', {
    timestamp,
    loadStartTime
  });

  // depends로 캐시 무효화
  depends('alarm-list');

  const session = await locals.auth();

  // 로그인 안한 경우
  if (!session?.user?.nickname) {
    throw error(401, { message: '로그인이 필요합니다.' });
  }

  // 최신 알림 조회 (최근 24시간)
  const dbStartTime = Date.now();
  let alarms = await Alarm.find({
    email: session.user.email,
    updatedAt: { $gt: new Date(new Date() - 1000 * 60 * 60 * 24) }
  })
    .select('boardId articleId title comments updatedAt comment commentContent readAt')
    .sort({ updatedAt: -1 })
    .limit(30);

  const dbEndTime = Date.now();

  if (alarms && alarms.length) {
    alarms = JSON.parse(JSON.stringify(alarms));
  }

  const totalTime = Date.now() - loadStartTime;

  console.log('🔔 [알림 페이지] load 함수 완료:', {
    timestamp,
    alarmCount: alarms?.length || 0,
    dbTime: `${dbEndTime - dbStartTime}ms`,
    totalTime: `${totalTime}ms`,
    fromCache: false // 항상 DB에서 조회
  });

  return {
    alarms
  };
};

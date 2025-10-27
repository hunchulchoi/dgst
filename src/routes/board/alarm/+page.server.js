import { error } from "@sveltejs/kit";
import { Alarm } from '$lib/models/alarm.js';
import connectDB from "$lib/database/mongoosePriomise.js";

connectDB();

// 캐시 방지 - 항상 최신 데이터 로드
export const load = async ({ locals, setHeaders }) => {

  // 캐시 헤더 설정 - 항상 새로 불러오기
  setHeaders({
    'Cache-Control': 'private, max-age=0, must-revalidate'
  });

  const session = await locals.auth();

  // 로그인 안한 경우
  if (!session?.user?.nickname) {
    throw error(401, { message: '로그인이 필요합니다.' });
  }

  // 알림 페이지 진입 시, 읽지 않은 알림은 즉시 읽음 처리
  await Alarm.updateMany({ email: session.user.email, readAt: null }, { $set: { readAt: new Date() } }, { timestamps: false });

  // 최신 알림 조회 (최근 24시간)
  let alarms = await Alarm.find({ email: session.user.email, updatedAt: { $gt: new Date(new Date() - 1000 * 60 * 60 * 24) } })
    .select('boardId articleId title comments updatedAt comment commentContent readAt')
    .sort({ updatedAt: -1 })
    .limit(30);


  if (alarms && alarms.length) {
    alarms = JSON.parse(JSON.stringify(alarms));
  }

  return {
    alarms,
  }
}

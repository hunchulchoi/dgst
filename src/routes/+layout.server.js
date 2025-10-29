import { Alarm } from '$lib/models/alarm.js';
import connectDB from "$lib/database/mongoosePriomise.js";

connectDB();

export const load = async (event) => {
  // 캐시 방지 헤더 설정 (이미 설정된 경우 무시)
  try {
    event.setHeaders({
      'Cache-Control': 'private, max-age=0, no-store, must-revalidate, proxy-revalidate'
    });
  } catch (err) {
    // 헤더가 이미 설정된 경우 무시
    if (!err.message?.includes('already set')) {
      throw err;
    }
  }

  const session = await event.locals.auth();

  // 캐시 방지는 hooks.server.js에서 처리
  let alarmCount = null; // 초기값을 null로 설정하여 로딩 상태 표시

  // 내용이 없는 알람 삭제
  await Alarm.deleteMany({ comments: { $exists: true, $eq: [] } })

  // 알림이 있는 지 확인
  if (session?.user?.nickname) {
    alarmCount = await Alarm.countDocuments({ email: session.user.email, readAt: null, createdAt: { $gt: new Date(new Date() - 1000 * 60 * 60 * 24) } });
  } else {
    alarmCount = 0; // 로그인하지 않은 경우 0으로 설정
  }

  console.log('layout server alarmCount', alarmCount)

  return {
    session,
    alarmCount
  };
};

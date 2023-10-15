import { Alarm } from '$lib/models/alarm.js';
import connectDB from "$lib/database/mongoosePriomise.js";

connectDB();

export const load = async (event) => {
  const session = await event.locals.getSession();

  let alarmCount = 0;

  // 알림이 있는 지 확인
  if (session?.user?.nickname) {
    alarmCount = await Alarm.countDocuments({ email: session.user.email });
  }
  
  console.log('layout server alarmCount', alarmCount)

  return {
    session,
    alarmCount
  };
};

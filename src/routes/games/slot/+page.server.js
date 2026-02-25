import connectDB from '$lib/database/mongoosePriomise.js';
import { GameScore } from '$lib/models/gameScore.js';
import { getTodaySlotStats } from '$lib/server/slotStats.js';
import { getUnreadAlarmCount } from '$lib/server/redis/alarmService.js';

connectDB();

export async function load({ locals, depends }) {
  // 캐시 무효화를 위해 depends 추가
  depends('slot-alarm');

  const session = await locals.auth();
  const email = session?.user?.email;
  let balance = 0;
  let todayStats = { spins: 0, users: 0 };
  let hasUnreadAlarm = false;
  let unreadAlarmCount = 0;
  if (email) {
    const last = await GameScore.findOne({ email })
      .sort({ createdAt: -1 })
      .select({ balance: 1 })
      .lean();
    balance = last?.balance ?? 0;
    unreadAlarmCount = await getUnreadAlarmCount(email);
    hasUnreadAlarm = unreadAlarmCount > 0;
  }
  todayStats = await getTodaySlotStats();
  return { session, balance, todayStats, hasUnreadAlarm, unreadAlarmCount };
}

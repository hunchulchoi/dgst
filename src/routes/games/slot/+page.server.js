import { getSlotBalance } from '$lib/server/slotUserBalance.js';
import { getTodaySlotStats } from '$lib/server/slotStats.js';
import { getUnreadAlarmCount } from '$lib/server/alarm/alarmService.js';

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
    balance = await getSlotBalance(email);
    unreadAlarmCount = await getUnreadAlarmCount(email);
    hasUnreadAlarm = unreadAlarmCount > 0;
  }
  todayStats = await getTodaySlotStats();
  return { session, balance, todayStats, hasUnreadAlarm, unreadAlarmCount };
}

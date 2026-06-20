import { getSlotBalance } from '$lib/server/slotUserBalance.js';
import { getTodaySlotStats } from '$lib/server/slotStats.js';
import { getUnreadAlarmCount } from '$lib/server/alarm/alarmService.js';
import { getPrisma } from '$lib/database/prisma.js';
import { normalizeToIsoString } from '$lib/util/formatRelativeTime.js';

export async function load({ locals, depends }) {
  // 캐시 무효화를 위해 depends 추가
  depends('slot-alarm');

  const session = await locals.auth();
  const email = session?.user?.email;
  let balance = 0;
  let todayStats = { spins: 0, users: 0 };
  let balanceUpdatedAt = null;
  let hasUnreadAlarm = false;
  let unreadAlarmCount = 0;
  if (email) {
    balance = await getSlotBalance(email);
    const balanceRow = await getPrisma().slotUserBalance.findUnique({
      where: { email },
      select: { updatedAt: true }
    });
    balanceUpdatedAt = balanceRow?.updatedAt ? normalizeToIsoString(balanceRow.updatedAt) : null;
    unreadAlarmCount = await getUnreadAlarmCount(email);
    hasUnreadAlarm = unreadAlarmCount > 0;
  }
  todayStats = await getTodaySlotStats();
  return { session, balance, balanceUpdatedAt, todayStats, hasUnreadAlarm, unreadAlarmCount };
}

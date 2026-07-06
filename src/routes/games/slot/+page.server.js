import { getSlotBalance } from '$lib/server/slotUserBalance.js';
import { getTodaySlotStats } from '$lib/server/slotStats.js';
import { getUnreadAlarmCount } from '$lib/server/alarm/alarmService.js';
import { getPrisma } from '$lib/database/prisma.js';
import { normalizeToIsoString } from '$lib/util/formatRelativeTime.js';
import { getGameSession, isLocalGameSmokeSession } from '$lib/server/localGameSmokeSession.js';

const SMOKE_SLOT_BALANCE = 1000;

export async function load(event) {
  const { depends } = event;
  // 캐시 무효화를 위해 depends 추가
  depends('slot-alarm');

  const session = await getGameSession(event);
  const email = session?.user?.email;
  let balance = 0;
  let todayStats = { spins: 0, users: 0 };
  let balanceUpdatedAt = null;
  let hasUnreadAlarm = false;
  let unreadAlarmCount = 0;
  if (isLocalGameSmokeSession(session)) {
    balance = SMOKE_SLOT_BALANCE;
  } else if (email) {
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

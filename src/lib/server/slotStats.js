import { getPrisma } from '$lib/database/prisma.js';

const KST_OFFSET_MINUTES = 9 * 60;

/**
 * @param {Date} [baseDate]
 * @returns {Date}
 */
function getKstStartOfDay(baseDate = new Date()) {
  const utcTime = baseDate.getTime() + baseDate.getTimezoneOffset() * 60_000;
  const kstDate = new Date(utcTime + KST_OFFSET_MINUTES * 60_000);
  kstDate.setHours(0, 0, 0, 0);
  return new Date(kstDate.getTime() - KST_OFFSET_MINUTES * 60_000);
}
/**
 * @typedef {{ spins: number; users: number }} SlotStats
 */

/**
 * @returns {Promise<SlotStats>}
 */
export async function getTodaySlotStats() {
  try {
    const startOfKstDay = getKstStartOfDay();
    const where = {
      game: 'slot',
      bet: { gt: 0 },
      createdAt: { gte: startOfKstDay }
    };
    const [spinCount, distinctUsers] = await Promise.all([
      getPrisma().gameScore.count({ where }),
      getPrisma().gameScore.groupBy({
        by: ['email'],
        where
      })
    ]);
    return {
      spins: spinCount,
      users: distinctUsers.length
    };
  } catch (err) {
    console.error('슬롯 통계 산출 실패:', err);
    return { spins: 0, users: 0 };
  }
}

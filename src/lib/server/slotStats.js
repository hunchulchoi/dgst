import { GameScore } from '$lib/models/gameScore.js';

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
    const baseFilter = {
      game: 'slot',
      bet: { $gt: 0 },
      createdAt: { $gte: startOfKstDay }
    };
    const [spinCount, distinctUserAgg] = await Promise.all([
      GameScore.countDocuments(baseFilter),
      GameScore.aggregate([
        { $match: baseFilter },
        { $group: { _id: '$email' } },
        { $count: 'count' }
      ])
    ]);
    return {
      spins: spinCount,
      users: distinctUserAgg?.[0]?.count ?? 0
    };
  } catch (err) {
    console.error('슬롯 통계 산출 실패:', err);
    return { spins: 0, users: 0 };
  }
}



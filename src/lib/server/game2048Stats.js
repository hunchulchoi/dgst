import { GameScore2048 } from '$lib/models/gameScore2048.js';

const KST_OFFSET_MINUTES = 9 * 60;

function getKstStartOfDay(baseDate = new Date()) {
  const utcTime = baseDate.getTime() + baseDate.getTimezoneOffset() * 60_000;
  const kstDate = new Date(utcTime + KST_OFFSET_MINUTES * 60_000);
  kstDate.setHours(0, 0, 0, 0);
  return new Date(kstDate.getTime() - KST_OFFSET_MINUTES * 60_000);
}

/**
 * 오늘(KST) 2048 게임 횟수·참여 인원
 * @returns {Promise<{ games: number; users: number }>}
 */
export async function getToday2048Stats() {
  try {
    const startOfKstDay = getKstStartOfDay();
    const baseFilter = { createdAt: { $gte: startOfKstDay } };
    const [games, distinctAgg] = await Promise.all([
      GameScore2048.countDocuments(baseFilter),
      GameScore2048.aggregate([
        { $match: baseFilter },
        { $group: { _id: '$email' } },
        { $count: 'count' }
      ])
    ]);
    return {
      games: games ?? 0,
      users: distinctAgg?.[0]?.count ?? 0
    };
  } catch (err) {
    console.error('2048 오늘 통계 산출 실패:', err);
    return { games: 0, users: 0 };
  }
}

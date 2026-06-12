import { getPrisma } from '$lib/database/prisma.js';

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
    const where = { createdAt: { gte: startOfKstDay } };
    const [games, distinctUsers] = await Promise.all([
      getPrisma().gameScore2048.count({ where }),
      getPrisma().gameScore2048.groupBy({
        by: ['email'],
        where
      })
    ]);
    return {
      games: games ?? 0,
      users: distinctUsers.length
    };
  } catch (err) {
    console.error('2048 오늘 통계 산출 실패:', err);
    return { games: 0, users: 0 };
  }
}

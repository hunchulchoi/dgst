import { getPrisma } from '$lib/database/prisma.js';

const KST_OFFSET_MINUTES = 9 * 60;
const BREAKOUT_GAME = 'breakout';

function getKstStartOfDay(baseDate = new Date()) {
  const utcTime = baseDate.getTime() + baseDate.getTimezoneOffset() * 60_000;
  const kstDate = new Date(utcTime + KST_OFFSET_MINUTES * 60_000);
  kstDate.setHours(0, 0, 0, 0);
  return new Date(kstDate.getTime() - KST_OFFSET_MINUTES * 60_000);
}

/**
 * 오늘(KST) 블록깨기 게임 시작 횟수·참여 인원
 * @returns {Promise<{ games: number; users: number }>}
 */
export async function getTodayBreakoutStats() {
  try {
    const startOfKstDay = getKstStartOfDay();
    const where = {
      game: BREAKOUT_GAME,
      action: 'start',
      createdAt: { gte: startOfKstDay }
    };

    const [games, distinctUsers] = await Promise.all([
      getPrisma().gameLog.count({ where }),
      getPrisma().gameLog.groupBy({
        by: ['email'],
        where: { ...where, email: { not: null } }
      })
    ]);

    return {
      games: games ?? 0,
      users: distinctUsers.length
    };
  } catch (err) {
    console.error('블록깨기 오늘 통계 산출 실패:', err);
    return { games: 0, users: 0 };
  }
}

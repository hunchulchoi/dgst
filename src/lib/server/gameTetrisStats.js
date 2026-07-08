import { getPrisma } from '$lib/database/prisma.js';

const KST_OFFSET_MINUTES = 9 * 60;
const TETRIS_GAME = 'tetris';

function getKstStartOfDay(baseDate = new Date()) {
  const utcTime = baseDate.getTime() + baseDate.getTimezoneOffset() * 60_000;
  const kstDate = new Date(utcTime + KST_OFFSET_MINUTES * 60_000);
  kstDate.setHours(0, 0, 0, 0);
  return new Date(kstDate.getTime() - KST_OFFSET_MINUTES * 60_000);
}

/**
 * 오늘(KST) 테트리스 게임 시작 횟수·참여 인원
 * @returns {Promise<{ games: number; users: number }>}
 */
export async function getTodayTetrisStats() {
  try {
    const startOfKstDay = getKstStartOfDay();
    const where = {
      game: TETRIS_GAME,
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
    console.error('테트리스 오늘 통계 산출 실패:', err);
    return { games: 0, users: 0 };
  }
}

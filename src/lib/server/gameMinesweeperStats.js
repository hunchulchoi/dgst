import { getPrisma } from '$lib/database/prisma.js';

const KST_OFFSET_MINUTES = 9 * 60;

function getKstStartOfDay(baseDate = new Date()) {
  const utcTime = baseDate.getTime() + baseDate.getTimezoneOffset() * 60_000;
  const kstDate = new Date(utcTime + KST_OFFSET_MINUTES * 60_000);
  kstDate.setHours(0, 0, 0, 0);
  return new Date(kstDate.getTime() - KST_OFFSET_MINUTES * 60_000);
}

/**
 * 오늘(KST) 지뢰찾기 게임 완료 횟수·참여 인원 (게임오버 또는 승리 시 저장)
 */
export async function getTodayMinesweeperStats() {
  try {
    const startOfKstDay = getKstStartOfDay();
    const where = { createdAt: { gte: startOfKstDay } };
    const [games, distinctUsers] = await Promise.all([
      getPrisma().gameScoreMinesweeper.count({ where }),
      getPrisma().gameScoreMinesweeper.groupBy({
        by: ['email'],
        where
      })
    ]);
    return {
      games: games ?? 0,
      users: distinctUsers.length
    };
  } catch (err) {
    console.error('지뢰찾기 오늘 통계 산출 실패:', err);
    return { games: 0, users: 0 };
  }
}

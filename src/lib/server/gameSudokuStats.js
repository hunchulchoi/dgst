import { getPrisma } from '$lib/database/prisma.js';

const KST_OFFSET_MINUTES = 9 * 60;

function getKstStartOfDay(baseDate = new Date()) {
  const offsetMs = KST_OFFSET_MINUTES * 60_000;
  const kstDate = new Date(baseDate.getTime() + offsetMs);
  return new Date(
    Date.UTC(kstDate.getUTCFullYear(), kstDate.getUTCMonth(), kstDate.getUTCDate()) - offsetMs
  );
}

/**
 * 오늘(KST) 선택 난이도 수도쿠 완료 횟수·참여 인원
 * @param {string} difficulty
 * @returns {Promise<{ games: number; users: number }>}
 */
export async function getTodaySudokuStats(difficulty) {
  try {
    const where = {
      difficulty,
      createdAt: { gte: getKstStartOfDay() }
    };
    const [games, distinctUsers] = await Promise.all([
      getPrisma().gameScoreSudoku.count({ where }),
      getPrisma().gameScoreSudoku.groupBy({ by: ['email'], where })
    ]);
    return { games: games ?? 0, users: distinctUsers.length };
  } catch (err) {
    console.error('수도쿠 오늘 통계 산출 실패:', err);
    return { games: 0, users: 0 };
  }
}

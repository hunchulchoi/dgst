import { GameScoreMinesweeper } from '$lib/models/gameScoreMinesweeper.js';

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
        const baseFilter = { createdAt: { $gte: startOfKstDay } };
        const [games, distinctAgg] = await Promise.all([
            GameScoreMinesweeper.countDocuments(baseFilter),
            GameScoreMinesweeper.aggregate([
                { $match: baseFilter },
                { $group: { _id: '$email' } },
                { $count: 'count' },
            ]),
        ]);
        return {
            games: games ?? 0,
            users: distinctAgg?.[0]?.count ?? 0,
        };
    } catch (err) {
        console.error('지뢰찾기 오늘 통계 산출 실패:', err);
        return { games: 0, users: 0 };
    }
}

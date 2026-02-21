import { GameLog } from '$lib/models/gameLog.js';

const KST_OFFSET_MINUTES = 9 * 60;

function getKstStartOfDay(baseDate = new Date()) {
    const utcTime = baseDate.getTime() + baseDate.getTimezoneOffset() * 60_000;
    const kstDate = new Date(utcTime + KST_OFFSET_MINUTES * 60_000);
    kstDate.setHours(0, 0, 0, 0);
    return new Date(kstDate.getTime() - KST_OFFSET_MINUTES * 60_000);
}

/**
 * 오늘(KST) 워터멜론 게임 시작 횟수 및 참여 인원
 */
export async function getTodayWatermelonStats() {
    try {
        const startOfKstDay = getKstStartOfDay();
        const baseFilter = {
            game: 'watermelon',
            action: 'start',
            createdAt: { $gte: startOfKstDay }
        };

        const [games, distinctAgg] = await Promise.all([
            GameLog.countDocuments(baseFilter),
            GameLog.aggregate([
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
        console.error('워터멜론 오늘 통계 산출 실패:', err);
        return { games: 0, users: 0 };
    }
}

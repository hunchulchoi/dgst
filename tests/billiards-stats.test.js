// @ts-nocheck
import { afterEach, describe, expect, it, vi } from 'vitest';

const prismaModule = vi.hoisted(() => ({
  getPrisma: vi.fn()
}));

vi.mock('$lib/database/prisma.js', () => prismaModule);

describe('billiards today stats', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it('counts games and distinct users for the selected ranking mode since KST midnight', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T03:00:00.000Z'));
    const count = vi.fn().mockResolvedValue(9);
    const groupBy = vi.fn().mockResolvedValue([
      { email: 'a@example.com' },
      { email: 'b@example.com' },
      { email: 'c@example.com' }
    ]);
    prismaModule.getPrisma.mockReturnValue({
      gameScoreBilliards: { count, groupBy }
    });

    const { getTodayBilliardsStats } = await import('../src/lib/server/gameBilliardsStats.js');
    const stats = await getTodayBilliardsStats('four-ball-10');
    const where = {
      mode: 'four-ball-10',
      createdAt: { gte: new Date('2026-07-13T15:00:00.000Z') }
    };

    expect(stats).toEqual({ games: 9, users: 3 });
    expect(count).toHaveBeenCalledWith({ where });
    expect(groupBy).toHaveBeenCalledWith({ by: ['email'], where });
  });
});

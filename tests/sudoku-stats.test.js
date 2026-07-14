// @ts-nocheck
import { afterEach, describe, expect, it, vi } from 'vitest';

const prismaModule = vi.hoisted(() => ({
  getPrisma: vi.fn()
}));

vi.mock('$lib/database/prisma.js', () => prismaModule);

describe('sudoku today stats', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it('counts games and distinct users for the selected difficulty since KST midnight', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T03:00:00.000Z'));
    const count = vi.fn().mockResolvedValue(7);
    const groupBy = vi.fn().mockResolvedValue([{ email: 'a@example.com' }, { email: 'b@example.com' }]);
    prismaModule.getPrisma.mockReturnValue({
      gameScoreSudoku: { count, groupBy }
    });

    const { getTodaySudokuStats } = await import('../src/lib/server/gameSudokuStats.js');
    const stats = await getTodaySudokuStats('hard');
    const where = {
      difficulty: 'hard',
      createdAt: { gte: new Date('2026-07-13T15:00:00.000Z') }
    };

    expect(stats).toEqual({ games: 7, users: 2 });
    expect(count).toHaveBeenCalledWith({ where });
    expect(groupBy).toHaveBeenCalledWith({ by: ['email'], where });
  });
});

// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaModule = vi.hoisted(() => ({
  getPrisma: vi.fn()
}));

const stats2048 = vi.hoisted(() => ({
  getToday2048Stats: vi.fn()
}));

const statsWatermelon = vi.hoisted(() => ({
  getTodayWatermelonStats: vi.fn()
}));

const statsMinesweeper = vi.hoisted(() => ({
  getTodayMinesweeperStats: vi.fn()
}));

const slotStats = vi.hoisted(() => ({
  getTodaySlotStats: vi.fn()
}));

vi.mock('$lib/database/prisma.js', () => prismaModule);
vi.mock('$lib/server/game2048Stats.js', () => stats2048);
vi.mock('$lib/server/gameWatermelonStats.js', () => statsWatermelon);
vi.mock('$lib/server/gameMinesweeperStats.js', () => statsMinesweeper);
vi.mock('$lib/server/slotStats.js', () => slotStats);

describe('game ranking routes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    stats2048.getToday2048Stats.mockResolvedValue({ games: 0, users: 0 });
    statsWatermelon.getTodayWatermelonStats.mockResolvedValue({ games: 0, users: 0 });
    statsMinesweeper.getTodayMinesweeperStats.mockResolvedValue({ games: 0, users: 0 });
    slotStats.getTodaySlotStats.mockResolvedValue({ spins: 0, users: 0 });
  });

  it('loads 2048 all-time per-user best scores with score timestamps', async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      {
        email: 'winner@example.com',
        nickname: 'winner',
        score: 1300,
        createdAt: new Date('2026-06-10T12:00:00.000Z')
      }
    ]);
    const findFirst = vi.fn().mockResolvedValue({
      score: 1300,
      createdAt: new Date('2026-06-10T12:00:00.000Z')
    });
    prismaModule.getPrisma.mockReturnValue({
      $queryRaw: queryRaw,
      gameScore2048: { findFirst }
    });

    const { GET } = await import('../src/routes/games/2048/+server.js');
    const response = await GET({
      locals: { auth: vi.fn().mockResolvedValue({ user: { email: 'me@example.com' } }) },
      url: new URL('https://dgst.me/games/2048?rank=1')
    });
    const body = await response.json();

    expect(body.rank).toEqual([
      {
        _id: 'winner@example.com',
        nickname: 'winner',
        score: 1300,
        createdAt: '2026-06-10T12:00:00.000Z'
      }
    ]);
    expect(body.myBest).toEqual({
      score: 1300,
      createdAt: '2026-06-10T12:00:00.000Z'
    });
    const sql = queryRaw.mock.calls[0][0].join(' ');
    expect(sql).toContain('PARTITION BY email');
    expect(sql).not.toContain('created_at >=');
    expect(findFirst).toHaveBeenCalledWith({
      where: { email: 'me@example.com' },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      select: { score: true, createdAt: true }
    });
  });

  it('loads watermelon all-time per-user best scores with score timestamps', async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      {
        email: 'melon@example.com',
        nickname: 'melon',
        score: 2048,
        createdAt: new Date('2026-06-09T12:00:00.000Z')
      }
    ]);
    const findFirst = vi.fn().mockResolvedValue({
      score: 2048,
      createdAt: new Date('2026-06-09T12:00:00.000Z')
    });
    prismaModule.getPrisma.mockReturnValue({
      $queryRaw: queryRaw,
      gameScoreWatermelon: { findFirst },
      gameLog: { create: vi.fn() }
    });

    const { GET } = await import('../src/routes/games/watermelon/+server.js');
    const response = await GET({
      locals: { auth: vi.fn().mockResolvedValue({ user: { email: 'me@example.com' } }) },
      url: new URL('https://dgst.me/games/watermelon?rank=1')
    });
    const body = await response.json();

    expect(body.rank[0]).toEqual({
      _id: 'melon@example.com',
      nickname: 'melon',
      score: 2048,
      createdAt: '2026-06-09T12:00:00.000Z'
    });
    expect(body.myBest).toEqual({
      score: 2048,
      createdAt: '2026-06-09T12:00:00.000Z'
    });
    const sql = queryRaw.mock.calls[0][0].join(' ');
    expect(sql).toContain('PARTITION BY email');
    expect(sql).not.toContain('created_at >=');
    expect(findFirst).toHaveBeenCalledWith({
      where: { email: 'me@example.com' },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      select: { score: true, createdAt: true }
    });
  });

  it('loads minesweeper all-time per-user best times with score timestamps', async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      {
        email: 'sweeper@example.com',
        nickname: 'sweeper',
        time: 42,
        createdAt: new Date('2026-06-08T12:00:00.000Z')
      }
    ]);
    const findFirst = vi.fn().mockResolvedValue({
      time: 42,
      createdAt: new Date('2026-06-08T12:00:00.000Z')
    });
    prismaModule.getPrisma.mockReturnValue({
      $queryRaw: queryRaw,
      gameScoreMinesweeper: { findFirst }
    });

    const { GET } = await import('../src/routes/games/minesweeper/+server.js');
    const response = await GET({
      locals: { auth: vi.fn().mockResolvedValue({ user: { email: 'me@example.com' } }) },
      url: new URL('https://dgst.me/games/minesweeper?rank=1&mode=expert')
    });
    const body = await response.json();

    expect(body.rank[0]).toEqual({
      _id: 'sweeper@example.com',
      nickname: 'sweeper',
      time: 42,
      createdAt: '2026-06-08T12:00:00.000Z'
    });
    expect(body.myBest).toEqual({
      time: 42,
      createdAt: '2026-06-08T12:00:00.000Z'
    });
    const sql = queryRaw.mock.calls[0][0].join(' ');
    expect(sql).toContain('PARTITION BY email');
    expect(sql).not.toContain('created_at >=');
    expect(findFirst).toHaveBeenCalledWith({
      where: { email: 'me@example.com', mode: 'expert' },
      orderBy: [{ time: 'asc' }, { createdAt: 'desc' }],
      select: { time: true, createdAt: true }
    });
  });

  it('loads slot balances with last updated timestamps', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      balance: 1200,
      createdAt: new Date('2026-06-10T12:00:00.000Z')
    });
    const findMany = vi.fn().mockResolvedValue([
      {
        email: 'slot@example.com',
        nickname: 'slotter',
        balance: 1300,
        totalSpin: 9,
        updatedAt: new Date('2026-06-11T12:00:00.000Z')
      }
    ]);
    const count = vi.fn().mockResolvedValue(1);
    const findUnique = vi.fn().mockResolvedValue({
      balance: 1200,
      updatedAt: new Date('2026-06-12T12:00:00.000Z')
    });
    prismaModule.getPrisma.mockReturnValue({
      gameScore: { findFirst },
      slotUserBalance: { count, findMany, findUnique }
    });

    const { GET } = await import('../src/routes/games/slot/+server.js');
    const response = await GET({
      locals: { auth: vi.fn().mockResolvedValue({ user: { email: 'me@example.com' } }) },
      url: new URL('https://dgst.me/games/slot?rank=1')
    });
    const body = await response.json();

    expect(body.balanceUpdatedAt).toBe('2026-06-12T12:00:00.000Z');
    expect(body.rank[0]).toEqual({
      _id: 'slot@example.com',
      nickname: 'slotter',
      balance: 1300,
      totalSpin: 9,
      updatedAt: '2026-06-11T12:00:00.000Z'
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { totalSpin: { gt: 0 } },
      orderBy: { balance: 'desc' },
      take: 10,
      select: { email: true, nickname: true, balance: true, totalSpin: true, updatedAt: true }
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { email: 'me@example.com' },
      select: { balance: true, updatedAt: true }
    });
  });
});

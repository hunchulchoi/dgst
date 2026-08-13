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

const statsTetris = vi.hoisted(() => ({
  getTodayTetrisStats: vi.fn()
}));

const statsBreakout = vi.hoisted(() => ({
  getTodayBreakoutStats: vi.fn()
}));

const statsSudoku = vi.hoisted(() => ({
  getTodaySudokuStats: vi.fn()
}));

const statsBilliards = vi.hoisted(() => ({
  getTodayBilliardsStats: vi.fn()
}));

const slotStats = vi.hoisted(() => ({
  getTodaySlotStats: vi.fn()
}));

const arcadeWallet = vi.hoisted(() => ({
  ensureArcadeWallet: vi.fn(),
  getArcadeRank: vi.fn(),
  resolveArcadeOops: vi.fn()
}));

vi.mock('$lib/database/prisma.js', () => prismaModule);
vi.mock('$lib/server/game2048Stats.js', () => stats2048);
vi.mock('$lib/server/gameWatermelonStats.js', () => statsWatermelon);
vi.mock('$lib/server/gameMinesweeperStats.js', () => statsMinesweeper);
vi.mock('$lib/server/gameTetrisStats.js', () => statsTetris);
vi.mock('$lib/server/gameBreakoutStats.js', () => statsBreakout);
vi.mock('$lib/server/gameSudokuStats.js', () => statsSudoku);
vi.mock('$lib/server/gameBilliardsStats.js', () => statsBilliards);
vi.mock('$lib/server/slotStats.js', () => slotStats);
vi.mock('$lib/server/arcadeWallet.js', () => arcadeWallet);

describe('game ranking routes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    stats2048.getToday2048Stats.mockResolvedValue({ games: 0, users: 0 });
    statsWatermelon.getTodayWatermelonStats.mockResolvedValue({ games: 0, users: 0 });
    statsMinesweeper.getTodayMinesweeperStats.mockResolvedValue({ games: 0, users: 0 });
    statsTetris.getTodayTetrisStats.mockResolvedValue({ games: 0, users: 0 });
    statsBreakout.getTodayBreakoutStats.mockResolvedValue({ games: 0, users: 0 });
    statsSudoku.getTodaySudokuStats.mockResolvedValue({ games: 0, users: 0 });
    statsBilliards.getTodayBilliardsStats.mockResolvedValue({ games: 0, users: 0 });
    slotStats.getTodaySlotStats.mockResolvedValue({ spins: 0, users: 0 });
    arcadeWallet.ensureArcadeWallet.mockResolvedValue({
      balance: 1000,
      updatedAt: new Date('2026-06-12T12:00:00.000Z')
    });
    arcadeWallet.resolveArcadeOops.mockResolvedValue({ balance: 1000, oopsInfo: null });
    arcadeWallet.getArcadeRank.mockResolvedValue([]);
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
      orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
      select: { score: true, createdAt: true }
    });
    expect(sql).toContain('ORDER BY score DESC, created_at ASC');
  });

  it('stores a 2048 score idempotently', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 0 });
    prismaModule.getPrisma.mockReturnValue({
      gameScore2048: { createMany }
    });

    const { POST } = await import('../src/routes/games/2048/+server.js');
    const response = await POST({
      locals: {
        auth: vi.fn().mockResolvedValue({
          user: { email: 'me@example.com', nickname: 'me' }
        })
      },
      request: new Request('https://dgst.me/games/2048', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: 113688 })
      })
    });

    expect(await response.json()).toEqual({ success: true, score: 113688 });
    expect(createMany).toHaveBeenCalledWith({
      data: { email: 'me@example.com', nickname: 'me', score: 113688 },
      skipDuplicates: true
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

  it('loads sudoku all-time per-user best times with UTC score timestamps', async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      {
        email: 'sudoku@example.com',
        nickname: 'sudoku',
        difficulty: 'normal',
        seconds: 180,
        mistakes: 1,
        createdAt: '2026-07-06T05:50:09.791Z'
      }
    ]);
    prismaModule.getPrisma.mockReturnValue({ $queryRaw: queryRaw });
    statsSudoku.getTodaySudokuStats.mockResolvedValue({ games: 7, users: 3 });

    const { GET } = await import('../src/routes/games/sudoku/+server.js');
    const response = await GET({
      locals: { auth: vi.fn().mockResolvedValue({ user: { email: 'me@example.com' } }) },
      url: new URL('https://dgst.me/games/sudoku?rank=1&difficulty=normal')
    });
    const body = await response.json();

    expect(body.rank[0]).toEqual({
      _id: 'sudoku@example.com',
      nickname: 'sudoku',
      difficulty: 'normal',
      seconds: 180,
      mistakes: 1,
      createdAt: '2026-07-06T05:50:09.791Z'
    });
    expect(body.myBest).toEqual({
      seconds: 180,
      mistakes: 1,
      createdAt: '2026-07-06T05:50:09.791Z'
    });
    expect(body.todayStats).toEqual({ games: 7, users: 3 });
    expect(statsSudoku.getTodaySudokuStats).toHaveBeenCalledWith('normal');
    const rankSql = queryRaw.mock.calls[0][0].join(' ');
    const myBestSql = queryRaw.mock.calls[1][0].join(' ');
    expect(rankSql).toContain('created_at AS "createdAt"');
    expect(rankSql).not.toContain('AT TIME ZONE');
    expect(myBestSql).toContain('created_at AS "createdAt"');
    expect(myBestSql).not.toContain('AT TIME ZONE');
  });

  it('loads billiards rankings with UTC score timestamps', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([
        {
          email: 'billiards@example.com',
          nickname: 'billiards',
          mode: 'four-ball',
          score: 7,
          createdAt: '2026-07-06T05:50:09.791Z'
        }
      ])
      .mockResolvedValueOnce([
        {
          score: 7,
          createdAt: '2026-07-06T05:50:09.791Z'
        }
      ]);
    prismaModule.getPrisma.mockReturnValue({ $queryRaw: queryRaw });
    statsBilliards.getTodayBilliardsStats.mockResolvedValue({ games: 9, users: 4 });

    const { GET } = await import('../src/routes/games/billiards/+server.js');
    const response = await GET({
      locals: {
        auth: vi.fn().mockResolvedValue({ user: { email: 'me@example.com', nickname: 'me' } })
      },
      url: new URL('https://dgst.me/games/billiards?rank=1&mode=four-ball')
    });
    const body = await response.json();

    expect(body.rank[0]).toEqual({
      _id: 'billiards@example.com',
      nickname: 'billiards',
      mode: 'four-ball',
      score: 7,
      createdAt: '2026-07-06T05:50:09.791Z'
    });
    expect(body.myBest).toEqual({
      score: 7,
      createdAt: '2026-07-06T05:50:09.791Z'
    });
    expect(body.todayStats).toEqual({ games: 9, users: 4 });
    expect(statsBilliards.getTodayBilliardsStats).toHaveBeenCalledWith('four-ball');
    const rankSql = queryRaw.mock.calls[0][0].join(' ');
    const myBestSql = queryRaw.mock.calls[1][0].join(' ');
    expect(rankSql).toContain('created_at AS "createdAt"');
    expect(rankSql).not.toContain('AT TIME ZONE');
    expect(rankSql).toContain("mode LIKE 'four-ball-%'");
    expect(myBestSql).toContain('created_at AS "createdAt"');
    expect(myBestSql).not.toContain('AT TIME ZONE');
    expect(myBestSql).toContain("mode LIKE 'four-ball-%'");
  });

  it('loads and saves art-puzzle rankings by cleared stage', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([
        {
          email: 'artist@example.com',
          nickname: 'artist',
          mode: 'art-puzzle',
          score: 8,
          createdAt: '2026-07-06T05:50:09.791Z'
        }
      ])
      .mockResolvedValueOnce([{ score: 8, createdAt: '2026-07-06T05:50:09.791Z' }]);
    const create = vi.fn().mockResolvedValue({});
    prismaModule.getPrisma.mockReturnValue({
      $queryRaw: queryRaw,
      gameScoreBilliards: { create }
    });

    const { GET, POST } = await import('../src/routes/games/billiards/+server.js');
    const locals = {
      auth: vi.fn().mockResolvedValue({
        user: { email: 'me@example.com', nickname: 'me' }
      })
    };
    const getResponse = await GET({
      locals,
      url: new URL('https://dgst.me/games/billiards?rank=1&mode=art-puzzle')
    });
    const getBody = await getResponse.json();

    expect(getBody.mode).toBe('art-puzzle');
    expect(getBody.rank[0].score).toBe(8);
    expect(statsBilliards.getTodayBilliardsStats).toHaveBeenCalledWith('art-puzzle');

    const postResponse = await POST({
      locals,
      request: new Request('https://dgst.me/games/billiards', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'art-puzzle', score: 7 })
      })
    });

    expect(postResponse.status).toBe(200);
    expect(create).toHaveBeenCalledWith({
      data: {
        email: 'me@example.com',
        nickname: 'me',
        mode: 'art-puzzle',
        score: 7
      }
    });
  });

  it('returns empty billiards rankings without Prisma for a local smoke session', async () => {
    const queryRaw = vi.fn();
    prismaModule.getPrisma.mockReturnValue({ $queryRaw: queryRaw });
    const { GET } = await import('../src/routes/games/billiards/+server.js');

    const response = await GET({
      locals: {
        auth: vi.fn().mockResolvedValue({
          user: {
            email: 'local-game-smoke@dgst.local',
            nickname: '로컬스모크'
          }
        })
      },
      url: new URL('http://127.0.0.1/games/billiards?rank=1&mode=four-ball')
    });
    const body = await response.json();

    expect(body).toEqual({
      rank: [],
      myBest: null,
      todayStats: { games: 0, users: 0 },
      mode: 'four-ball',
      smoke: true
    });
    expect(queryRaw).not.toHaveBeenCalled();
    expect(statsBilliards.getTodayBilliardsStats).not.toHaveBeenCalled();
  });

  it('loads slot balances with last updated timestamps', async () => {
    arcadeWallet.resolveArcadeOops.mockResolvedValue({ balance: 1200, oopsInfo: null });
    arcadeWallet.ensureArcadeWallet.mockResolvedValue({
      balance: 1200,
      updatedAt: new Date('2026-06-12T12:00:00.000Z')
    });
    arcadeWallet.getArcadeRank.mockResolvedValue([
      {
        email: 'slot@example.com',
        _id: 'slot@example.com',
        nickname: 'slotter',
        balance: 1300,
        lastGame: 'slot',
        updatedAt: '2026-06-11T12:00:00.000Z'
      }
    ]);

    const { GET } = await import('../src/routes/games/slot/+server.js');
    const response = await GET({
      locals: { auth: vi.fn().mockResolvedValue({ user: { email: 'me@example.com' } }) },
      url: new URL('https://dgst.me/games/slot?rank=1')
    });
    const body = await response.json();

    expect(body.balanceUpdatedAt).toBe('2026-06-12T12:00:00.000Z');
    expect(body.rank[0]).toEqual({
      email: 'slot@example.com',
      _id: 'slot@example.com',
      nickname: 'slotter',
      balance: 1300,
      lastGame: 'slot',
      updatedAt: '2026-06-11T12:00:00.000Z'
    });
    expect(arcadeWallet.resolveArcadeOops).toHaveBeenCalledWith(
      'me@example.com',
      'anonymous',
      'slot'
    );
    expect(arcadeWallet.getArcadeRank).toHaveBeenCalledWith(10);
  });

  it('loads tetris all-time per-user best scores from game_logs', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([
        {
          email: 'tetris@example.com',
          nickname: 'block',
          score: 4200,
          stage: 10,
          createdAt: new Date('2026-06-08T12:00:00.000Z')
        }
      ])
      .mockResolvedValueOnce([
        {
          score: 3500,
          stage: 8,
          createdAt: new Date('2026-06-07T12:00:00.000Z')
        }
      ]);
    const create = vi.fn();
    prismaModule.getPrisma.mockReturnValue({
      $queryRaw: queryRaw,
      gameLog: { create }
    });

    const { GET, POST } = await import('../src/routes/games/tetris/+server.js');
    const response = await GET({
      locals: { auth: vi.fn().mockResolvedValue({ user: { email: 'me@example.com' } }) },
      url: new URL('https://dgst.me/games/tetris?rank=1')
    });
    const body = await response.json();

    expect(body.rank).toEqual([
      {
        _id: 'tetris@example.com',
        nickname: 'block',
        score: 4200,
        stage: 10,
        createdAt: '2026-06-08T12:00:00.000Z'
      }
    ]);
    expect(body.myBest).toEqual({
      score: 3500,
      stage: 8,
      createdAt: '2026-06-07T12:00:00.000Z'
    });
    const sql = queryRaw.mock.calls[0][0].join(' ');
    expect(sql).toContain('game_logs');
    expect(sql).toContain('PARTITION BY email');

    const postResponse = await POST({
      locals: {
        auth: vi.fn().mockResolvedValue({
          user: { email: 'me@example.com', nickname: 'me' }
        })
      },
      request: new Request('https://dgst.me/games/tetris', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: 1200, stage: 20 })
      })
    });
    const postBody = await postResponse.json();
    expect(postBody.success).toBe(true);
    expect(create).toHaveBeenCalledWith({
      data: {
        game: 'tetris',
        action: 'score',
        email: 'me@example.com',
        meta: { nickname: 'me', score: 1200, stage: 20 }
      }
    });
  });

  it('loads breakout all-time per-user best scores from game_logs', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([
        {
          email: 'breakout@example.com',
          nickname: 'paddle',
          score: 8500,
          stage: 10,
          createdAt: new Date('2026-06-08T12:00:00.000Z')
        }
      ])
      .mockResolvedValueOnce([
        {
          score: 4200,
          stage: 6,
          createdAt: new Date('2026-06-07T12:00:00.000Z')
        }
      ]);
    const create = vi.fn();
    prismaModule.getPrisma.mockReturnValue({
      $queryRaw: queryRaw,
      gameLog: { create }
    });

    const { GET, POST } = await import('../src/routes/games/breakout/+server.js');
    const response = await GET({
      locals: { auth: vi.fn().mockResolvedValue({ user: { email: 'me@example.com' } }) },
      url: new URL('https://dgst.me/games/breakout?rank=1')
    });
    const body = await response.json();

    expect(body.rank).toEqual([
      {
        _id: 'breakout@example.com',
        nickname: 'paddle',
        score: 8500,
        stage: 10,
        createdAt: '2026-06-08T12:00:00.000Z'
      }
    ]);
    expect(body.myBest).toEqual({
      score: 4200,
      stage: 6,
      createdAt: '2026-06-07T12:00:00.000Z'
    });
    const sql = queryRaw.mock.calls[0][0].join(' ');
    expect(sql).toContain('game_logs');
    expect(sql).toContain('PARTITION BY email');

    const postResponse = await POST({
      locals: {
        auth: vi.fn().mockResolvedValue({
          user: { email: 'me@example.com', nickname: 'me' }
        })
      },
      request: new Request('https://dgst.me/games/breakout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: 3000, stage: 4 })
      })
    });
    const postBody = await postResponse.json();
    expect(postBody.success).toBe(true);
    expect(create).toHaveBeenCalledWith({
      data: {
        game: 'breakout',
        action: 'score',
        email: 'me@example.com',
        meta: { nickname: 'me', score: 3000, stage: 4 }
      }
    });
  });
});

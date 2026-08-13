// @ts-nocheck
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const prismaModule = vi.hoisted(() => ({
  getPrisma: vi.fn()
}));

vi.mock('$lib/database/prisma.js', () => prismaModule);

describe('board celebrations', () => {
  it('uses only shared-medal leader changes for medal-game fireworks', () => {
    const source = readFileSync('src/lib/server/boardCelebrations.js', 'utf8');
    expect(source).toContain("WHERE kind = 'leader-change'");
    expect(source).not.toContain("WHERE game IN ('seotda', 'seotda-leader')");
  });

  it('uses the first 2048 achievement row for a stable celebration id', () => {
    const source = readFileSync('src/lib/server/boardCelebrations.js', 'utf8');
    expect(source).toContain(
      'ROW_NUMBER() OVER (PARTITION BY email ORDER BY score DESC, created_at ASC) AS rn'
    );
  });

  it('temporarily celebrates the current ssamchi leader', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T14:00:00.000Z'));
    prismaModule.getPrisma.mockReturnValue({
      $queryRaw: vi
        .fn()
        .mockResolvedValue([{ email: 'leader@example.com', nickname: '구슬왕', balance: 4321 }])
    });

    const { rank1SsamchiBootstrap } = await import('../src/lib/server/boardCelebrations.js');
    const celebration = await rank1SsamchiBootstrap();

    expect(celebration).toMatchObject({
      id: 'rank1:ssamchi:bootstrap-20260718:leader@example.com',
      game: 'ssamchi',
      label: '짤짤이 1등',
      nickname: '구슬왕',
      detail: '4,321개',
      until: '2026-07-19T01:40:00.000Z'
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it('returns a separate recent rank-one celebration for every sudoku difficulty', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T06:00:00.000Z'));

    prismaModule.getPrisma.mockReturnValue({
      $queryRaw: vi.fn().mockResolvedValue([
        {
          nickname: 'easy-winner',
          seconds: 90,
          mistakes: 0,
          difficulty: 'easy',
          createdAt: new Date('2026-07-13T05:00:00.000Z')
        },
        {
          nickname: 'normal-winner',
          seconds: 150,
          mistakes: 1,
          difficulty: 'normal',
          createdAt: new Date('2026-07-13T04:00:00.000Z')
        },
        {
          nickname: 'hard-winner',
          seconds: 240,
          mistakes: 2,
          difficulty: 'hard',
          createdAt: new Date('2026-07-13T03:00:00.000Z')
        }
      ])
    });

    const { rank1Sudoku } = await import('../src/lib/server/boardCelebrations.js');
    const celebrations = await rank1Sudoku();

    expect(celebrations).toHaveLength(3);
    expect(celebrations.map((item) => item.id)).toEqual([
      'rank1:sudoku:easy:2026-07-13T05:00:00.000Z',
      'rank1:sudoku:normal:2026-07-13T04:00:00.000Z',
      'rank1:sudoku:hard:2026-07-13T03:00:00.000Z:2026-07-13-hard-rank1-replay'
    ]);
  });

  it('returns a separate recent rank-one celebration for every minesweeper mode', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T06:00:00.000Z'));

    prismaModule.getPrisma.mockReturnValue({
      $queryRaw: vi.fn().mockResolvedValue([
        {
          nickname: 'beginner-winner',
          time: 8,
          mode: 'beginner',
          createdAt: new Date('2026-07-13T05:00:00.000Z')
        },
        {
          nickname: 'intermediate-winner',
          time: 45,
          mode: 'intermediate',
          createdAt: new Date('2026-07-13T04:00:00.000Z')
        },
        {
          nickname: 'expert-winner',
          time: 120,
          mode: 'expert',
          createdAt: new Date('2026-07-13T03:00:00.000Z')
        }
      ])
    });

    const { rank1Minesweeper } = await import('../src/lib/server/boardCelebrations.js');
    const celebrations = await rank1Minesweeper();

    expect(celebrations).toHaveLength(3);
    expect(celebrations.map((item) => item.id)).toEqual([
      'rank1:minesweeper:beginner:2026-07-13T05:00:00.000Z',
      'rank1:minesweeper:intermediate:2026-07-13T04:00:00.000Z',
      'rank1:minesweeper:expert:2026-07-13T03:00:00.000Z'
    ]);
  });
});

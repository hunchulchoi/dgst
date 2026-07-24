import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { gameScore, transaction } = vi.hoisted(() => ({
  gameScore: {
    findFirst: vi.fn(),
    create: vi.fn()
  },
  transaction: vi.fn()
}));

vi.mock('$lib/database/prisma.js', () => ({
  getPrisma: () => ({ gameScore, $transaction: transaction })
}));

import { resolveSeotdaOops, writeSeotdaSettlement } from './seotdaBalance.js';

describe('resolveSeotdaOops', () => {
  const oopsAt = new Date('2026-07-14T00:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    gameScore.findFirst.mockReset();
    gameScore.create.mockReset();
    transaction.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it('returns wait metadata without writing before five minutes', async () => {
    vi.setSystemTime(new Date(oopsAt.getTime() + 4 * 60_000));
    gameScore.findFirst.mockResolvedValueOnce({ createdAt: oopsAt }).mockResolvedValueOnce(null);

    await expect(resolveSeotdaOops('user@example.com', 'user')).resolves.toEqual({
      balance: 0,
      oopsInfo: {
        createdAt: oopsAt.toISOString(),
        remainingMs: 60_000,
        waiting: true
      }
    });
    expect(gameScore.create).not.toHaveBeenCalled();
  });

  it('writes and returns 700 points after five minutes', async () => {
    vi.setSystemTime(new Date(oopsAt.getTime() + 5 * 60_000));
    gameScore.findFirst.mockResolvedValueOnce({ createdAt: oopsAt }).mockResolvedValueOnce(null);
    gameScore.create.mockResolvedValue({});

    await expect(resolveSeotdaOops('user@example.com', 'user')).resolves.toEqual({
      balance: 700,
      oopsInfo: null
    });
    expect(gameScore.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'user@example.com',
        game: 'seotda',
        balance: 700,
        reels: ['oops', '700', '-']
      })
    });
  });

  it('refills an existing user left with less than the minimum ante', async () => {
    vi.setSystemTime(new Date(oopsAt.getTime() + 10 * 60_000));
    gameScore.findFirst.mockResolvedValueOnce({ createdAt: oopsAt }).mockResolvedValueOnce(null);
    gameScore.create.mockResolvedValue({});

    await expect(resolveSeotdaOops('legacy@example.com', 'legacy', 7)).resolves.toEqual({
      balance: 700,
      oopsInfo: null
    });
    expect(gameScore.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ balance: { lt: 10 } })
      })
    );
    expect(gameScore.findFirst.mock.calls[0][0].where).not.toHaveProperty('bet');
  });

  it('writes the busted hand and eligible gaepyeong atomically', async () => {
    gameScore.create.mockResolvedValue({});
    transaction.mockResolvedValue([{}, {}]);

    await writeSeotdaSettlement(
      'user@example.com',
      'user',
      {
        balance: 0,
        bet: 7000,
        payout: 0,
        delta: -7000,
        reels: ['lose', '-7000', '올인']
      },
      { balance: 700, amount: 700, loss: 7000 }
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(gameScore.create).toHaveBeenCalledTimes(2);
    expect(gameScore.create.mock.calls[1][0].data).toMatchObject({
      balance: 700,
      bet: 0,
      payout: 700,
      delta: 700,
      reels: ['gaepyeong', '700', 'loss:7000']
    });
    expect(gameScore.create.mock.calls[1][0].data.createdAt.getTime()).toBeGreaterThan(
      gameScore.create.mock.calls[0][0].data.createdAt.getTime()
    );
  });
});

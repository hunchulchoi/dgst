import { beforeEach, describe, expect, it, vi } from 'vitest';

const arcadeWallet = vi.hoisted(() => ({
  resolveArcadeOops: vi.fn(),
  applyArcadeEntries: vi.fn()
}));

vi.mock('$lib/server/arcadeWallet.js', () => ({
  resolveArcadeOops: arcadeWallet.resolveArcadeOops,
  applyArcadeEntries: arcadeWallet.applyArcadeEntries,
  applyArcadeEntry: vi.fn(),
  ensureArcadeWallet: vi.fn(),
  getArcadeBalance: vi.fn(),
  getArcadeLeader: vi.fn(),
  getArcadeRank: vi.fn()
}));

import { resolveSeotdaOops, writeSeotdaSettlement } from './seotdaBalance.js';

describe('resolveSeotdaOops', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns wait metadata without writing before five minutes', async () => {
    const oopsInfo = {
      createdAt: '2026-07-14T00:00:00.000Z',
      readyAt: '2026-07-14T00:05:00.000Z',
      remainingMs: 60_000,
      waiting: true
    };
    arcadeWallet.resolveArcadeOops.mockResolvedValue({ balance: 0, oopsInfo });

    await expect(resolveSeotdaOops('user@example.com', 'user')).resolves.toEqual({
      balance: 0,
      oopsInfo
    });
    expect(arcadeWallet.resolveArcadeOops).toHaveBeenCalledWith(
      'user@example.com',
      'user',
      'seotda'
    );
  });

  it('writes and returns 700 points after five minutes', async () => {
    arcadeWallet.resolveArcadeOops.mockResolvedValue({ balance: 700, oopsInfo: null });

    await expect(resolveSeotdaOops('user@example.com', 'user')).resolves.toEqual({
      balance: 700,
      oopsInfo: null
    });
    expect(arcadeWallet.resolveArcadeOops).toHaveBeenCalledWith(
      'user@example.com',
      'user',
      'seotda'
    );
  });

  it('refills an existing user left with less than the minimum ante', async () => {
    arcadeWallet.resolveArcadeOops.mockResolvedValue({ balance: 700, oopsInfo: null });

    await expect(resolveSeotdaOops('legacy@example.com', 'legacy', 7)).resolves.toEqual({
      balance: 700,
      oopsInfo: null
    });
    expect(arcadeWallet.resolveArcadeOops).toHaveBeenCalledWith(
      'legacy@example.com',
      'legacy',
      'seotda'
    );
  });

  it('writes the busted hand and eligible gaepyeong atomically', async () => {
    arcadeWallet.applyArcadeEntries.mockResolvedValue({ balance: 700, scores: [{}, {}] });

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

    expect(arcadeWallet.applyArcadeEntries).toHaveBeenCalledTimes(1);
    const entries = arcadeWallet.applyArcadeEntries.mock.calls[0][2];
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      game: 'seotda',
      bet: 7000,
      payout: 0,
      delta: -7000,
      reels: ['lose', '-7000', '올인']
    });
    expect(entries[1]).toMatchObject({
      game: 'seotda',
      kind: 'gaepyeong',
      bet: 0,
      payout: 700,
      delta: 700,
      reels: ['gaepyeong', '700', 'loss:7000']
    });
    expect(entries[0].meta).toEqual({ requestedBalance: 0 });
    expect(entries[1].meta).toEqual({ requestedBalance: 700 });
  });
});

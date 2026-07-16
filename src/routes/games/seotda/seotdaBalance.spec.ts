import { describe, expect, it } from 'vitest';
import {
  didSeotdaTakeLead,
  getSeotdaOopsTiming,
  isSeotdaOopsBalance,
  summarizeSeotdaSparkHistory
} from './seotdaBalance.js';

describe('seotda leader celebration', () => {
  it('celebrates only when another users first place is surpassed', () => {
    const leader = { email: 'leader@example.com', balance: 10_000 };

    expect(didSeotdaTakeLead(leader, 'challenger@example.com', 10_001)).toBe(true);
    expect(didSeotdaTakeLead(leader, 'challenger@example.com', 10_000)).toBe(false);
    expect(didSeotdaTakeLead(leader, 'leader@example.com', 12_000)).toBe(false);
    expect(didSeotdaTakeLead(null, 'first@example.com', 1_000)).toBe(false);
  });
});

describe('seotda Spark history', () => {
  it('summarizes long-term profit and consecutive public behavior signals', () => {
    const summary = summarizeSeotdaSparkHistory([
      {
        bet: 300n,
        delta: 150n,
        balance: 1300n,
        reels: ['win', '150', '레이즈', 'user:max-raise', 'spark:on']
      },
      {
        bet: 200n,
        delta: 100n,
        balance: 1150n,
        reels: ['win', '100', '레이즈', 'user:max-raise', 'spark:on']
      },
      { bet: 100n, delta: 50n, balance: 1050n, reels: ['win', '50', '다이'] }
    ]);

    expect(summary).toMatchObject({
      hands: 3,
      wins: 3,
      totalDelta: 300,
      balanceGrowthPercent: 30,
      consecutiveFolds: 0,
      consecutiveMaxRaises: 2,
      sparkHands: 2,
      consecutiveSparkHands: 2
    });
  });
});

describe('seotda oops top-up timing', () => {
  it('treats every balance below the minimum ante as oops', () => {
    expect(isSeotdaOopsBalance(0)).toBe(true);
    expect(isSeotdaOopsBalance(9)).toBe(true);
    expect(isSeotdaOopsBalance(10)).toBe(false);
  });

  it('returns the remaining wait before five minutes', () => {
    const createdAt = new Date('2026-07-14T00:00:00.000Z');

    expect(getSeotdaOopsTiming(createdAt, createdAt.getTime() + 4 * 60_000)).toEqual({
      createdAt: createdAt.toISOString(),
      remainingMs: 60_000,
      ready: false
    });
  });

  it('marks the top-up ready after five minutes', () => {
    const createdAt = new Date('2026-07-14T00:00:00.000Z');

    expect(getSeotdaOopsTiming(createdAt, createdAt.getTime() + 5 * 60_000)).toEqual({
      createdAt: createdAt.toISOString(),
      remainingMs: 0,
      ready: true
    });
  });
});

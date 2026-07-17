import { describe, expect, it } from 'vitest';
import {
  didSeotdaTakeLead,
  didSeotdaPromoteLeader,
  getSeotdaOopsTiming,
  isSeotdaOopsBalance,
  shouldForceSparkForRaise,
  shouldRequestSparkDecision,
  sparkDecisionCooldownMs,
  sparkInterventionHands,
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

  it('celebrates when a settled first-place user drops below the runner-up', () => {
    const before = { email: 'old-leader@example.com' };
    const promoted = { email: 'runner-up@example.com' };

    expect(didSeotdaPromoteLeader(before, promoted, 'old-leader@example.com')).toBe(true);
    expect(didSeotdaPromoteLeader(before, before, 'old-leader@example.com')).toBe(false);
    expect(didSeotdaPromoteLeader(before, promoted, 'someone-else@example.com')).toBe(false);
    expect(didSeotdaPromoteLeader(before, null, 'old-leader@example.com')).toBe(false);
  });
});

describe('seotda Spark history', () => {
  it('forces a Spark request for an applied raise of at least one billion', () => {
    expect(shouldForceSparkForRaise('raise', 999_999_999)).toBe(false);
    expect(shouldForceSparkForRaise('call', 1_000_000_000)).toBe(false);
    expect(shouldForceSparkForRaise('raise', 1_000_000_000)).toBe(true);
    expect(shouldForceSparkForRaise('raise', 5_000_000_000)).toBe(true);
  });

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
      recent10Delta: 300,
      recent10GrowthPercent: 30,
      consecutiveFolds: 0,
      consecutiveMaxRaises: 2,
      sparkHands: 2,
      consecutiveSparkHands: 2
    });
  });

  it('keeps an active policy for two hands above 100k', () => {
    expect(
      sparkInterventionHands(
        163_597,
        { recent10Delta: 5_000, recent10GrowthPercent: 3 },
        { active: true, difficulty: 'balanced' }
      )
    ).toBe(2);
  });

  it('keeps challenge for three hands only on high balance or rapid profit', () => {
    const challenge = { active: true, difficulty: 'challenge' };

    expect(
      sparkInterventionHands(
        163_597,
        { recent10Delta: 18_000, recent10GrowthPercent: 12 },
        challenge
      )
    ).toBe(3);
    expect(
      sparkInterventionHands(250_000, { recent10Delta: 0, recent10GrowthPercent: 0 }, challenge)
    ).toBe(3);
    expect(
      sparkInterventionHands(
        90_000,
        { recent10Delta: 20_000, recent10GrowthPercent: 20 },
        challenge
      )
    ).toBe(1);
  });

  it('requests routine low-balance Spark supervision only every 20 hands', () => {
    expect(shouldRequestSparkDecision(30_000, { hands: 0 })).toBe(false);
    expect(shouldRequestSparkDecision(30_000, { hands: 19 })).toBe(false);
    expect(shouldRequestSparkDecision(30_000, { hands: 20 })).toBe(true);
    expect(shouldRequestSparkDecision(30_000, { hands: 21 })).toBe(false);
    expect(shouldRequestSparkDecision(100_000, { hands: 1 })).toBe(true);
  });

  it('allows early low-balance supervision only for abnormal streaks', () => {
    expect(shouldRequestSparkDecision(30_000, { hands: 7, consecutiveFolds: 5 })).toBe(true);
    expect(shouldRequestSparkDecision(30_000, { hands: 7, consecutiveMaxRaises: 3 })).toBe(true);
  });

  it('uses a long token-saving cooldown below 100k', () => {
    expect(sparkDecisionCooldownMs(30_000, {}, true)).toBe(30 * 60_000);
    expect(sparkDecisionCooldownMs(30_000, { consecutiveFolds: 5 }, false)).toBe(10 * 60_000);
    expect(sparkDecisionCooldownMs(100_000, {}, true)).toBe(30_000);
    expect(sparkDecisionCooldownMs(100_000, {}, false)).toBe(3 * 60_000);
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

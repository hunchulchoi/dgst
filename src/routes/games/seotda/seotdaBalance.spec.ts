import { describe, expect, it } from 'vitest';
import { didSeotdaTakeLead, getSeotdaOopsTiming } from './seotdaBalance.js';

describe('seotda leader celebration', () => {
  it('celebrates only when another users first place is surpassed', () => {
    const leader = { email: 'leader@example.com', balance: 10_000 };

    expect(didSeotdaTakeLead(leader, 'challenger@example.com', 10_001)).toBe(true);
    expect(didSeotdaTakeLead(leader, 'challenger@example.com', 10_000)).toBe(false);
    expect(didSeotdaTakeLead(leader, 'leader@example.com', 12_000)).toBe(false);
    expect(didSeotdaTakeLead(null, 'first@example.com', 1_000)).toBe(false);
  });
});

describe('seotda oops top-up timing', () => {
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

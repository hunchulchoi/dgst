import { describe, expect, it } from 'vitest';
import { didSeotdaTakeLead } from './seotdaBalance.js';

describe('seotda leader celebration', () => {
  it('celebrates only when another users first place is surpassed', () => {
    const leader = { email: 'leader@example.com', balance: 10_000 };

    expect(didSeotdaTakeLead(leader, 'challenger@example.com', 10_001)).toBe(true);
    expect(didSeotdaTakeLead(leader, 'challenger@example.com', 10_000)).toBe(false);
    expect(didSeotdaTakeLead(leader, 'leader@example.com', 12_000)).toBe(false);
    expect(didSeotdaTakeLead(null, 'first@example.com', 1_000)).toBe(false);
  });
});

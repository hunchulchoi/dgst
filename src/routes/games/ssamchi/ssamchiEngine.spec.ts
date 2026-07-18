import { describe, expect, it } from 'vitest';
import { drawHiddenCoins, HIT_MULTIPLIER, MAX_COINS, playSsamchi } from './ssamchiEngine.js';

describe('ssamchi engine', () => {
  it('draws 0 through 3 coins', () => {
    expect(drawHiddenCoins(() => 0)).toBe(0);
    expect(drawHiddenCoins(() => 0.999)).toBe(MAX_COINS);
  });

  it('pays four times the bet for an exact total', () => {
    const values = [0.3, 0.55, 0.9]; // 1, 2, 3
    const result = playSsamchi({ hiddenCoins: 2, guess: 8, bet: 50 }, () => values.shift() ?? 0);
    expect(result).toMatchObject({ npcCoins: [1, 2, 3], total: 8, hit: true });
    expect(result.payout).toBe(50 * HIT_MULTIPLIER);
    expect(result.delta).toBe(150);
  });

  it('loses the bet when the guess misses', () => {
    const result = playSsamchi({ hiddenCoins: 0, guess: 0, bet: 10 }, () => 0.99);
    expect(result).toMatchObject({ total: 9, hit: false, payout: 0, delta: -10 });
  });

  it('rejects totals impossible with the chosen hand', () => {
    expect(() => playSsamchi({ hiddenCoins: 3, guess: 2, bet: 10 })).toThrow('가능한 합계');
  });
});

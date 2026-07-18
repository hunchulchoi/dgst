import { describe, expect, it } from 'vitest';
import { drawMarbles, MAX_MARBLES, playOddEven, playSsamchi } from './ssamchiEngine.js';

describe('odd-even and ssamchi engine', () => {
  it('draws 1 through 15 marbles', () => {
    expect(drawMarbles(() => 0)).toBe(1);
    expect(drawMarbles(() => 0.999)).toBe(MAX_MARBLES);
  });

  it('wins an odd-even bet when the parity matches', () => {
    const result = playOddEven({ choice: 'odd', bet: 50 }, () => 0); // 1개
    expect(result).toMatchObject({
      marbles: 1,
      answer: 'odd',
      outcome: 'win',
      payout: 100,
      delta: 50
    });
  });

  it('loses an odd-even bet when the parity misses', () => {
    const result = playOddEven({ choice: 'even', bet: 50 }, () => 0); // 1개
    expect(result).toMatchObject({ outcome: 'lose', payout: 0, delta: -50 });
  });

  it('uses eujji=1, ni=2 and ssam=0', () => {
    expect(playSsamchi({ take: 1, give: 0, bet: 10 }, () => 0)).toMatchObject({
      answer: 1,
      outcome: 'win'
    });
    expect(playSsamchi({ take: 1, give: 0, bet: 10 }, () => 2 / 15)).toMatchObject({
      marbles: 3,
      answer: 0,
      outcome: 'lose'
    });
  });

  it('returns the bet on the uncalled third result', () => {
    const result = playSsamchi({ take: 1, give: 0, bet: 100 }, () => 1 / 15); // 2개 = 니
    expect(result).toMatchObject({ answer: 2, outcome: 'draw', payout: 100, delta: 0 });
  });

  it('keeps the host win from an NPC miss', () => {
    const result = playOddEven({ userIsHost: true, marbles: 2, bet: 50 }, () => 0); // NPC는 홀
    expect(result).toMatchObject({ choice: 'odd', answer: 'even', outcome: 'win', delta: 50 });
  });

  it('hands the win to an NPC that calls the host result', () => {
    const result = playSsamchi({ userIsHost: true, marbles: 1, bet: 10 }, () => 0); // 으찌 먹고, 니 떠
    expect(result).toMatchObject({ take: 1, give: 2, answer: 1, outcome: 'lose' });
  });

  it('rejects duplicate ssamchi calls', () => {
    expect(() => playSsamchi({ take: 1, give: 1, bet: 10 })).toThrow('서로 다른');
  });
});

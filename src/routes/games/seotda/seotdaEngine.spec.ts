import { describe, expect, it } from 'vitest';
import {
  ANTE,
  compareHands,
  createDeck,
  evaluateHand,
  handStrength,
  settlePot,
  shuffleDeck
} from './seotdaEngine.js';

/** @param {number} month @param {boolean} [gwang] */
function c(month, gwang = false) {
  return { month, gwang };
}

describe('seotdaEngine deck', () => {
  it('creates 20 cards with gwang on 1,3,8', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(20);
    const gwang = deck.filter((x) => x.gwang);
    expect(gwang.map((x) => x.month).sort((a, b) => a - b)).toEqual([1, 3, 8]);
    for (let m = 1; m <= 10; m++) {
      expect(deck.filter((x) => x.month === m)).toHaveLength(2);
    }
  });

  it('shuffle keeps same multiset', () => {
    const deck = createDeck();
    const shuffled = shuffleDeck([...deck], () => 0.3);
    expect(shuffled).toHaveLength(20);
    const key = (d) =>
      [...d]
        .map((x) => `${x.month}${x.gwang ? 'G' : ''}`)
        .sort()
        .join(',');
    expect(key(shuffled)).toBe(key(deck));
  });
});

describe('seotdaEngine hands', () => {
  it('ranks 38 gwangddang highest', () => {
    const a = evaluateHand([c(3, true), c(8, true)]);
    const b = evaluateHand([c(1, true), c(3, true)]);
    expect(a.name).toBe('38광땡');
    expect(compareHands(a, b)).toBeGreaterThan(0);
  });

  it('ranks jjangddang over alli', () => {
    const a = evaluateHand([c(10), c(10)]);
    const b = evaluateHand([c(1), c(2)]);
    expect(a.name).toBe('장땡');
    expect(b.name).toBe('알리');
    expect(compareHands(a, b)).toBeGreaterThan(0);
  });

  it('ranks alli over doksa over gupping', () => {
    const alli = evaluateHand([c(1), c(2)]);
    const doksa = evaluateHand([c(1), c(4)]);
    const gup = evaluateHand([c(1), c(9)]);
    expect(compareHands(alli, doksa)).toBeGreaterThan(0);
    expect(compareHands(doksa, gup)).toBeGreaterThan(0);
  });

  it('ranks ggeut by (month sum % 10)', () => {
    const gapo = evaluateHand([c(4), c(5)]); // 9
    const mang = evaluateHand([c(2), c(8)]); // 0
    expect(gapo.name).toBe('갑오');
    expect(mang.name).toBe('망통');
    expect(compareHands(gapo, mang)).toBeGreaterThan(0);
  });

  it('handStrength is 0..1 and higher for better hands', () => {
    const weak = handStrength(evaluateHand([c(2), c(8)]));
    const strong = handStrength(evaluateHand([c(3, true), c(8, true)]));
    expect(weak).toBeGreaterThanOrEqual(0);
    expect(strong).toBeLessThanOrEqual(1);
    expect(strong).toBeGreaterThan(weak);
  });
});

describe('seotdaEngine pot', () => {
  it('ANTE is 10', () => {
    expect(ANTE).toBe(10);
  });

  it('settlePot pays winner the pot and zeros pot', () => {
    const players = [
      { id: 'user', chips: 100, folded: false, contrib: 30 },
      { id: 'npc1', chips: 80, folded: true, contrib: 10 },
      { id: 'npc2', chips: 50, folded: false, contrib: 30 }
    ];
    const pot = 70;
    const result = settlePot(players, pot, 'user');
    expect(result.pot).toBe(0);
    expect(result.players.find((p) => p.id === 'user')?.chips).toBe(170);
  });

  it('settlePot when all fold except one awards pot', () => {
    const players = [
      { id: 'user', chips: 90, folded: true, contrib: 10 },
      { id: 'npc1', chips: 80, folded: false, contrib: 20 }
    ];
    const result = settlePot(players, 30, 'npc1');
    expect(result.players.find((p) => p.id === 'npc1')?.chips).toBe(110);
  });
});

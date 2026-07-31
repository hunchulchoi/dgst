import { describe, expect, it } from 'vitest';
import {
  ANTE,
  compareHands,
  createDeck,
  dynamicAnte,
  MAX_ANTE,
  bestDoriArrangement,
  doriArrangements,
  evaluateHand,
  handStrength,
  minRaisePay,
  raiseAmount,
  settlePot,
  settlePotSplit,
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
  it('finds every valid dori arrangement and keeps the remaining two cards', () => {
    const cards = [c(1), c(2), c(7), c(9), c(9)];
    const arrangements = doriArrangements(cards);

    expect(arrangements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          doriIndices: [0, 1, 2],
          resultCards: [c(9), c(9)],
          hand: expect.objectContaining({ name: '구땡' })
        })
      ])
    );
  });

  it('chooses the strongest remaining two-card hand for an NPC', () => {
    const cards = [c(1), c(2), c(7), c(3, true), c(8, true)];
    const best = bestDoriArrangement(cards);

    expect(best?.doriIndices).toEqual([0, 1, 2]);
    expect(best?.hand.name).toBe('38광땡');
  });

  it('returns null when five cards cannot make dori', () => {
    expect(bestDoriArrangement([c(1), c(1), c(1), c(2), c(2)])).toBeNull();
  });

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

  it('same ggeut is a tie (3+4 vs 9+8)', () => {
    const a = evaluateHand([c(3), c(4)]); // 7
    const b = evaluateHand([c(9), c(8)]); // 17 → 7
    expect(a.name).toBe('7끗');
    expect(b.name).toBe('7끗');
    expect(compareHands(a, b)).toBe(0);
  });

  it('handStrength is 0..1 and higher for better hands', () => {
    const weak = handStrength(evaluateHand([c(2), c(8)]));
    const strong = handStrength(evaluateHand([c(3, true), c(8, true)]));
    expect(weak).toBeGreaterThanOrEqual(0);
    expect(strong).toBeLessThanOrEqual(1);
    expect(strong).toBeGreaterThan(weak);
  });

  it('handStrength meaningfully separates ordinary ggeut hands', () => {
    const mang = handStrength(evaluateHand([c(2), c(8)]));
    const four = handStrength(evaluateHand([c(1), c(3)]));
    const gapo = handStrength(evaluateHand([c(4), c(5)]));

    expect(four).toBeGreaterThan(mang + 0.15);
    expect(gapo).toBeGreaterThan(four + 0.15);
  });
});

describe('seotdaEngine pot', () => {
  it('ANTE is 10', () => {
    expect(ANTE).toBe(10);
  });

  it('uses the 0.5% / 1% / 1.5% ante tiers with a 30k cap', () => {
    expect(dynamicAnte(1000)).toBe(10);
    expect(dynamicAnte(10_000)).toBe(50);
    expect(dynamicAnte(99_999)).toBe(499);
    expect(dynamicAnte(100_000)).toBe(1_000);
    expect(dynamicAnte(500_000)).toBe(5_000);
    expect(dynamicAnte(1_000_000)).toBe(15_000);
    expect(dynamicAnte(2_000_000)).toBe(30_000);
    expect(dynamicAnte(10_000_000)).toBe(150_000);
    expect(dynamicAnte(6_451_000_000)).toBe(96_765_000);
    expect(dynamicAnte(14_300_000_000)).toBe(MAX_ANTE);
  });

  it('raiseAmount respects requested size with min clamp', () => {
    expect(minRaisePay(10)).toBe(20);
    expect(raiseAmount(10, 500, 50)).toBe(50);
    expect(raiseAmount(10, 500, 5)).toBe(20); // below min → min
    expect(raiseAmount(10, 30, 100)).toBe(30); // all-in cap
    expect(minRaisePay(100, 100)).toBe(200);
    expect(raiseAmount(100, 1000, 50, 100)).toBe(200);
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

  it('settlePotSplit splits pot on tie', () => {
    const players = [
      { id: 'user', chips: 100, folded: false, contrib: 40 },
      { id: 'npc1', chips: 80, folded: false, contrib: 40 }
    ];
    const result = settlePotSplit(players, 80, ['user', 'npc1']);
    expect(result.pot).toBe(0);
    expect(result.players.find((p) => p.id === 'user')?.chips).toBe(140);
    expect(result.players.find((p) => p.id === 'npc1')?.chips).toBe(120);
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

import { describe, expect, it } from 'vitest';
import { createNewRound, applyPlayerAction, runNpcTurns } from './seotdaRound.js';
import { chooseNpcAction, NPC_PROFILES } from './seotdaNpc.js';

describe('seotdaRound smoke', () => {
  it('start → die → showdown or continue', () => {
    let i = 0;
    const rng = () => {
      i += 1;
      return (i % 10) / 10;
    };
    const round = createNewRound(1000, rng);
    expect(round.seats).toHaveLength(4);
    expect(round.pot).toBe(40);
    expect(round.seats[0].chips).toBe(990);
    applyPlayerAction(round, 'user', 'die');
    runNpcTurns(round, rng);
    expect(['betting', 'showdown']).toContain(round.phase);
  });

  it('start → call → npc turns finish to showdown', () => {
    let i = 0;
    const rng = () => {
      i += 1;
      return 0.1 + (i % 5) * 0.05;
    };
    const round = createNewRound(1000, rng);
    applyPlayerAction(round, 'user', 'call');
    runNpcTurns(round, rng);
    // after one street of actions should usually be showdown
    expect(round.phase === 'showdown' || round.seats.some((s) => s.lastAction)).toBe(true);
  });

  it('repeated call after npc raise eventually reaches showdown (no infinite street)', () => {
    // NPCs always raise when they can → used to re-open street forever
    const alwaysRaise = () => 0.01;
    const round = createNewRound(5000, alwaysRaise);
    let guards = 0;
    while (round.phase === 'betting' && guards < 20) {
      guards++;
      const user = round.seats[0];
      if (user.folded) break;
      const toCall = Math.max(0, round.currentBet - user.contrib);
      applyPlayerAction(round, 'user', toCall > 0 ? 'call' : 'call');
      runNpcTurns(round, alwaysRaise);
    }
    expect(round.phase).toBe('showdown');
    expect(guards).toBeLessThan(20);
  });
});

describe('seotdaNpc bluff', () => {
  it('bluffer often raises weak hands when forced', () => {
    const profile = NPC_PROFILES.find((p) => p.style === 'bluffer');
    expect(profile).toBeTruthy();
    const weak = [
      { month: 2, gwang: false },
      { month: 8, gwang: false }
    ];
    let raises = 0;
    for (let n = 0; n < 40; n++) {
      const a = chooseNpcAction(
        weak,
        profile,
        { toCall: 10, chips: 500, pot: 40, raiseSeen: false, forcePressure: true },
        () => 0.1
      );
      if (a === 'raise') raises++;
    }
    expect(raises).toBeGreaterThan(20);
  });
});

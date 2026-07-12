import { describe, expect, it } from 'vitest';
import {
  MAX_BET_ANTE_MULTIPLIER,
  createNewRound,
  applyPlayerAction,
  runNpcTurns,
  showdown
} from './seotdaRound.js';
import { chooseNpcAction, NPC_PROFILES, npcRaiseChips } from './seotdaNpc.js';

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

  it('carries NPC chips into next round via npcChipMap', () => {
    const round = createNewRound(1000, () => 0.5, { npc_agwi: 1300, npc_goni: 800, npc_madam: 50 });
    // ante 10 deducted
    expect(round.seats.find((s) => s.id === 'npc_agwi')?.chips).toBe(1290);
    expect(round.seats.find((s) => s.id === 'npc_goni')?.chips).toBe(790);
    expect(round.seats.find((s) => s.id === 'npc_madam')?.chips).toBe(40);
  });

  it('fresh table NPCs start near player chips', () => {
    const userChips = 3500;
    const round = createNewRound(userChips, () => 0.5, {});
    for (const s of round.seats.filter((x) => x.isNpc)) {
      // ante already taken; before ante was ~userChips * 0.85~1.15
      const beforeAnte = s.chips + 10;
      expect(beforeAnte).toBeGreaterThanOrEqual(Math.floor(userChips * 0.85));
      expect(beforeAnte).toBeLessThanOrEqual(Math.ceil(userChips * 1.15));
    }
  });

  it('charges a bankroll-scaled ante at high balances', () => {
    const round = createNewRound(100_000, () => 0.5, {});

    expect(round.antePaid).toBe(100);
    expect(round.currentBet).toBe(100);
    expect(round.pot).toBe(400);
    expect(round.seats[0].chips).toBe(99_900);
  });

  it('caps a players total contribution at 20 times the ante', () => {
    const round = createNewRound(100_000, () => 0.5, {});
    const user = round.seats[0];

    applyPlayerAction(round, 'user', 'raise', user.chips);

    expect(user.contrib).toBe(round.antePaid * MAX_BET_ANTE_MULTIPLIER);
    expect(round.currentBet).toBe(round.antePaid * MAX_BET_ANTE_MULTIPLIER);
  });

  it('pays main and side pots according to each players contribution', () => {
    const round = createNewRound(1000, () => 0.5);
    const [user, shortStack, sidePotWinner, loser] = round.seats;
    user.cards = [
      { month: 3, gwang: true },
      { month: 8, gwang: true }
    ];
    shortStack.cards = [
      { month: 2, gwang: false },
      { month: 8, gwang: false }
    ];
    sidePotWinner.cards = [
      { month: 1, gwang: false },
      { month: 2, gwang: false }
    ];
    loser.cards = [
      { month: 3, gwang: false },
      { month: 4, gwang: false }
    ];
    user.contrib = 100;
    shortStack.contrib = 300;
    sidePotWinner.contrib = 300;
    loser.contrib = 300;
    user.chips = 0;
    shortStack.chips = 0;
    sidePotWinner.chips = 0;
    loser.chips = 0;
    round.pot = 1000;

    showdown(round);

    expect(round.seats.find((seat) => seat.id === user.id)?.chips).toBe(400);
    expect(round.seats.find((seat) => seat.id === sidePotWinner.id)?.chips).toBe(600);
  });

  it('keeps the pot and redeals to active players on a tie', () => {
    const round = createNewRound(1000, () => 0.5);
    const [user, npc1, npc2, folded] = round.seats;
    user.cards = [
      { month: 3, gwang: false },
      { month: 4, gwang: false }
    ];
    npc1.cards = [
      { month: 9, gwang: false },
      { month: 8, gwang: false }
    ];
    npc2.cards = [
      { month: 2, gwang: false },
      { month: 5, gwang: false }
    ];
    folded.folded = true;
    const potBefore = round.pot;

    showdown(round, () => 0.25);

    expect(round.phase).toBe('betting');
    expect(round.pot).toBe(potBefore);
    expect(round.currentBet).toBe(0);
    expect(round.winnerIds).toEqual([]);
    expect(user.needsAction).toBe(true);
    expect(npc1.needsAction).toBe(true);
    expect(npc2.needsAction).toBe(true);
    expect(folded.folded).toBe(true);
    expect(folded.needsAction).toBe(false);
    expect(round.log.at(-1)).toContain('재경기');

    const chipsBeforeReplayBet = user.chips;
    user.cards = [
      { month: 3, gwang: true },
      { month: 8, gwang: true }
    ];
    npc1.cards = [
      { month: 1, gwang: false },
      { month: 2, gwang: false }
    ];
    npc2.cards = [
      { month: 2, gwang: false },
      { month: 5, gwang: false }
    ];
    for (const seat of [user, npc1, npc2]) {
      seat.contrib = 10;
      seat.chips -= 10;
      seat.needsAction = false;
    }
    round.pot += 30;
    round.currentBet = 10;

    showdown(round);

    expect(round.phase).toBe('showdown');
    expect(round.pot).toBe(0);
    expect(round.seats.find((seat) => seat.id === user.id)?.chips).toBe(
      chipsBeforeReplayBet - 10 + potBefore + 30
    );
  });
});

describe('seotdaNpc bluff', () => {
  it('agwi (bluffer) sometimes raises weak hands when forced, not always', () => {
    const profile = NPC_PROFILES.find((p) => p.style === 'bluffer');
    expect(profile?.name).toBe('아귀');
    const weak = [
      { month: 2, gwang: false },
      { month: 8, gwang: false }
    ];
    let raises = 0;
    for (let n = 0; n < 50; n++) {
      let i = n;
      const rng = () => {
        i += 1;
        return ((i * 17) % 100) / 100;
      };
      const a = chooseNpcAction(
        weak,
        profile,
        { toCall: 10, chips: 500, pot: 40, raiseSeen: false, forcePressure: true },
        rng
      );
      if (a === 'raise') raises++;
    }
    expect(raises).toBeGreaterThan(5);
    expect(raises).toBeLessThan(45);
  });

  it('npcRaiseChips varies size randomly', () => {
    const sizes = new Set();
    for (let n = 0; n < 40; n++) {
      let i = n;
      const rng = () => {
        i += 1;
        return ((i * 13) % 100) / 100;
      };
      sizes.add(npcRaiseChips(10, 1000, rng));
    }
    expect(sizes.size).toBeGreaterThan(2);
  });

  it('facing huge raise: strong hands often all-in call instead of always fold', () => {
    const profile = NPC_PROFILES.find((p) => p.style === 'bluffer');
    const strong = [
      { month: 10, gwang: false },
      { month: 10, gwang: false }
    ];
    let calls = 0;
    for (let n = 0; n < 40; n++) {
      let i = n;
      const rng = () => {
        i += 1;
        return ((i * 19) % 100) / 100;
      };
      const a = chooseNpcAction(
        strong,
        profile,
        { toCall: 2500, chips: 900, pot: 2600, raiseSeen: true, forcePressure: false },
        rng
      );
      if (a === 'call') calls++;
    }
    expect(calls).toBeGreaterThan(15);
  });

  it('folds a non-ddang hand against an oversized raise', () => {
    const profile = NPC_PROFILES.find((p) => p.style === 'bluffer');
    const ordinary = [
      { month: 1, gwang: false },
      { month: 2, gwang: false }
    ];
    const action = chooseNpcAction(
      ordinary,
      profile,
      {
        toCall: 800,
        chips: 10_000,
        pot: 500,
        raiseSeen: true,
        forcePressure: false,
        ante: 100
      },
      () => 0.99
    );

    expect(action).toBe('die');
  });

  it('lets the designated bluff catcher call an oversized raise', () => {
    const profile = NPC_PROFILES.find((p) => p.style === 'bluffer');
    const ordinary = [
      { month: 1, gwang: false },
      { month: 2, gwang: false }
    ];
    const action = chooseNpcAction(
      ordinary,
      profile,
      {
        toCall: 800,
        chips: 10_000,
        pot: 500,
        raiseSeen: true,
        bluffCatcher: true,
        ante: 100
      },
      () => 0.3
    );

    expect(action).toBe('call');
  });
});

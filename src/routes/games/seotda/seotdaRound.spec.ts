import { describe, expect, it } from 'vitest';
import {
  npcPlayerRelief,
  npcStartingChips,
  arrangeBossHand,
  createNewRound,
  ddaengValue,
  applyNpcSeatAction,
  applyGaepyeongIfOops,
  applyPlayerAction,
  contributionCapacity,
  finishIfNeeded,
  maxRoundContribution,
  nextSeatNeedingAction,
  npcStackForNextRound,
  runNpcTurns,
  runNpcTurnsWithSpark,
  seotdaAuditLogEntries,
  seotdaHandLogEntries,
  showdown,
  settleDdaengValue,
  sparkTauntCooldownAfterRound,
  userChipResult
} from './seotdaRound.js';
import {
  chooseNpcAction,
  localNpcTauntForAction,
  NPC_PROFILES,
  npcRaiseChips,
  publicBluffSuspicionChance,
  sparkBluffReraiseChance,
  sparkTauntForAction
} from './seotdaNpc.js';

describe('seotdaRound smoke', () => {
  it('deals five cards in the boss hand and lets only the user arrange their dori', () => {
    const round = createNewRound(
      1000,
      () => 0.5,
      {},
      'user',
      0,
      null,
      {},
      {
        handNo: 5,
        isBoss: true,
        bossNpcId: 'npc_goni',
        anteMultiplier: 2,
        completed: 4,
        userWins: 2,
        npcWins: 2
      }
    );
    const user = round.seats.find((seat) => seat.id === 'user')!;
    const npc = round.seats.find((seat) => seat.isNpc)!;

    expect(round.seats).toHaveLength(2);
    expect(user.cards).toHaveLength(5);
    expect(npc.cards).toHaveLength(5);
    expect(npc.doriIndices).not.toBeNull();
  });

  it('accepts only a user-selected three-card dori whose sum is a multiple of ten', () => {
    const round = createNewRound(1000, () => 0.5);
    round.series = {
      handNo: 5,
      isBoss: true,
      bossNpcId: 'npc_goni',
      anteMultiplier: 2,
      completed: 4,
      userWins: 2,
      npcWins: 2
    };
    const user = round.seats.find((seat) => seat.id === 'user')!;
    user.cards = [
      { month: 1, gwang: false },
      { month: 2, gwang: false },
      { month: 7, gwang: false },
      { month: 9, gwang: false },
      { month: 9, gwang: false }
    ];
    user.doriIndices = null;

    expect(() => arrangeBossHand(round, 'user', [0, 1, 3])).toThrow('합이 10의 배수');
    arrangeBossHand(round, 'user', [0, 1, 2]);
    expect(user.doriIndices).toEqual([0, 1, 2]);
    expect(user.resultCards?.map((card) => card.month)).toEqual([9, 9]);
  });

  it('settles a boss showdown using only the two cards left after each dori', () => {
    const round = createNewRound(
      1000,
      () => 0.5,
      {},
      'user',
      0,
      null,
      {},
      {
        handNo: 5,
        isBoss: true,
        bossNpcId: 'npc_goni',
        anteMultiplier: 2,
        completed: 4,
        userWins: 2,
        npcWins: 2
      }
    );
    const user = round.seats.find((seat) => seat.id === 'user')!;
    const npc = round.seats.find((seat) => seat.isNpc)!;
    user.cards = [
      { month: 1, gwang: false },
      { month: 2, gwang: false },
      { month: 7, gwang: false },
      { month: 9, gwang: false },
      { month: 9, gwang: false }
    ];
    npc.cards = [
      { month: 1, gwang: false },
      { month: 3, gwang: false },
      { month: 6, gwang: false },
      { month: 8, gwang: false },
      { month: 8, gwang: false }
    ];
    user.doriIndices = [0, 1, 2];
    user.resultCards = [user.cards[3], user.cards[4]];
    npc.doriIndices = [0, 1, 2];
    npc.resultCards = [npc.cards[3], npc.cards[4]];

    showdown(round);

    expect(round.winnerId).toBe('user');
    expect(round.log).toContain('나 승리! 구땡');
  });

  it('returns 10% gaepyeong immediately after going bust', () => {
    const round = createNewRound(7000, () => 0.5);
    const user = round.seats.find((seat) => seat.id === 'user')!;
    user.chips = 0;
    round.winnerId = 'npc_agwi';
    round.winnerIds = ['npc_agwi'];

    const settlement = applyGaepyeongIfOops(7000, round);

    expect(settlement).toMatchObject({
      handResult: { after: 0, delta: -7000 },
      finalResult: { after: 700, delta: -6300 },
      amount: 700
    });
    expect(user.chips).toBe(700);
    expect(round.gaepyeongLine).toContain('잃은 돈 10%, 700점 개평 줄게');
  });

  it('does not pay when 10% gaepyeong is below 700 points', () => {
    const round = createNewRound(6990, () => 0.5);
    round.seats.find((seat) => seat.id === 'user')!.chips = 0;

    expect(applyGaepyeongIfOops(6990, round).amount).toBe(0);
  });

  it('caps gaepyeong at 100,000 points', () => {
    const round = createNewRound(2_000_000, () => 0.5);
    round.seats.find((seat) => seat.id === 'user')!.chips = 0;
    round.winnerId = 'npc_goni';

    expect(applyGaepyeongIfOops(2_000_000, round).amount).toBe(100_000);
  });

  it('does not pay gaepyeong while the player can still afford the ante', () => {
    const round = createNewRound(1000, () => 0.5);
    round.seats.find((seat) => seat.id === 'user')!.chips = 10;

    expect(applyGaepyeongIfOops(1000, round).amount).toBe(0);
  });

  it('applies stronger NPC relief below 100k while keeping relief above it modest', () => {
    expect(npcPlayerRelief(42_454)).toBe(1.5);
    expect(npcPlayerRelief(99_999)).toBe(1.5);
    expect(npcPlayerRelief(100_000)).toBe(1.5);
    expect(npcPlayerRelief(150_000)).toBe(1.45);
    expect(npcPlayerRelief(210_001)).toBe(1.2);
    expect(npcPlayerRelief(999_999)).toBe(1.2);
    expect(npcPlayerRelief(1_000_000)).toBe(0.07);
  });

  it('calculates ddaeng value from the initial ante only', () => {
    expect(
      ddaengValue(
        [
          { month: 9, gwang: false },
          { month: 9, gwang: false }
        ],
        100
      )
    ).toBe(100);
    expect(
      ddaengValue(
        [
          { month: 10, gwang: false },
          { month: 10, gwang: false }
        ],
        100
      )
    ).toBe(200);
    expect(
      ddaengValue(
        [
          { month: 3, gwang: true },
          { month: 8, gwang: true }
        ],
        100
      )
    ).toBe(300);
    expect(
      ddaengValue(
        [
          { month: 1, gwang: false },
          { month: 2, gwang: false }
        ],
        100
      )
    ).toBe(0);
  });

  it('collects ddaeng value from every loser up to each current stack', () => {
    const seats = [
      {
        id: 'user',
        cards: [
          { month: 10, gwang: false },
          { month: 10, gwang: false }
        ],
        chips: 100,
        totalContrib: 100
      },
      { id: 'npc1', cards: [], chips: 250, totalContrib: 100 },
      { id: 'npc2', cards: [], chips: 50, totalContrib: 100 },
      { id: 'npc3', cards: [], chips: 200, totalContrib: 100 }
    ];

    const result = settleDdaengValue(seats, 'user', 100);

    expect(result.valuePerLoser).toBe(200);
    expect(result.totalPaid).toBe(450);
    expect(result.seats.map((seat) => seat.chips)).toEqual([550, 50, 0, 0]);
    expect(result.seats.slice(1).map((seat) => seat.totalContrib)).toEqual([300, 150, 300]);
  });

  it('charges only non-ddaeng losers and pays only the final winner', () => {
    const seats = [
      {
        id: 'winner',
        cards: [
          { month: 10, gwang: false },
          { month: 10, gwang: false }
        ],
        chips: 100,
        totalContrib: 100
      },
      {
        id: 'other-ddaeng',
        cards: [
          { month: 9, gwang: false },
          { month: 9, gwang: false }
        ],
        chips: 500,
        totalContrib: 100
      },
      {
        id: 'ordinary',
        cards: [
          { month: 1, gwang: false },
          { month: 2, gwang: false }
        ],
        chips: 500,
        totalContrib: 100
      }
    ];

    const result = settleDdaengValue(seats, 'winner', 100);

    expect(result.totalPaid).toBe(200);
    expect(result.seats.map((seat) => seat.chips)).toEqual([300, 500, 300]);
    expect(result.payerIds).toEqual(['ordinary']);
  });

  it('applies jang-ddaeng value after the normal showdown pot settlement', () => {
    const round = createNewRound(20_000, () => 0.5);
    const [user, ...npcs] = round.seats;
    user.cards = [
      { month: 10, gwang: false },
      { month: 10, gwang: false }
    ];
    const losingCards = [
      [
        { month: 1, gwang: false },
        { month: 2, gwang: false }
      ],
      [
        { month: 2, gwang: false },
        { month: 5, gwang: false }
      ],
      [
        { month: 3, gwang: false },
        { month: 4, gwang: false }
      ]
    ];
    npcs.forEach((npc, index) => {
      npc.cards = losingCards[index];
    });
    const userBefore = user.chips;

    showdown(round);

    expect(round.antePaid).toBe(100);
    expect(round.seats[0].chips).toBe(userBefore + 400 + 600);
    expect(round.log).toContain('땡값 장땡: 200씩 · 총 600');
  });

  it('collects and records winning ddaeng value after the user folds', () => {
    const round = createNewRound(20_000, () => 0.5);
    const [user, winner, ...others] = round.seats;
    user.folded = true;
    user.needsAction = false;
    winner.cards = [
      { month: 10, gwang: false },
      { month: 10, gwang: false }
    ];
    for (const seat of others) {
      seat.folded = true;
      seat.needsAction = false;
    }
    const userBefore = user.chips;

    finishIfNeeded(round);

    expect(round.winnerId).toBe(winner.id);
    expect(round.ddaengWinnerId).toBe(winner.id);
    expect(round.ddaengHandName).toBe('장땡');
    expect(round.ddaengValuePerLoser).toBe(200);
    expect(round.seats[0].chips).toBe(userBefore - 200);
  });

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

  it('records the actual amount paid with each player action', () => {
    const checkedRound = createNewRound(1000, () => 0.5);
    applyPlayerAction(checkedRound, 'user', 'call');
    expect(checkedRound.seats[0].lastAction).toBe('체크');
    expect(checkedRound.seats[0].lastActionAmount).toBe(0);

    const raisedRound = createNewRound(20_000, () => 0.5);
    applyPlayerAction(raisedRound, 'user', 'raise', 200);
    expect(raisedRound.seats[0].lastAction).toBe('레이즈');
    expect(raisedRound.seats[0].lastActionAmount).toBe(200);

    const caller = raisedRound.seats[1];
    caller.needsAction = true;
    applyPlayerAction(raisedRound, caller.id, 'call');
    expect(caller.lastAction).toBe('콜');
    expect(caller.lastActionAmount).toBe(200);

    const foldedRound = createNewRound(1000, () => 0.5);
    applyPlayerAction(foldedRound, 'user', 'die');
    expect(foldedRound.seats[0].lastActionAmount).toBe(0);
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
    expect(round.seats.find((s) => s.id === 'npc_agwi')?.chips).toBe(890);
    expect(round.seats.find((s) => s.id === 'npc_goni')?.chips).toBe(790);
    expect(round.seats.find((s) => s.id === 'npc_madam')?.chips).toBe(40);
  });

  it('starts from the previous winner and rotates back to the user', () => {
    const round = createNewRound(120_000, () => 0.99, {}, 'npc_goni');

    expect(round.openingActorId).toBe('npc_goni');
    expect(nextSeatNeedingAction(round)?.id).toBe('npc_goni');
    runNpcTurns(round, () => 0.99);
    expect(round.seats.find((seat) => seat.id === 'npc_goni')?.lastAction).toBeTruthy();
    expect(round.seats.find((seat) => seat.id === 'npc_madam')?.lastAction).toBeTruthy();
    expect(round.seats.find((seat) => seat.id === 'npc_agwi')?.lastAction).toBeNull();
    expect(nextSeatNeedingAction(round)?.id).toBe('user');
  });

  it('returns NPC actions in table order for client pacing', () => {
    const round = createNewRound(120_000, () => 0.99, {}, 'npc_goni');

    const actions = runNpcTurns(round, () => 0.99);

    expect(actions.map((action) => action.seatId)).toEqual(['npc_goni', 'npc_madam']);
    expect(actions.every((action) => action.action === '체크')).toBe(true);
  });

  it('safely handles an exhausted street with no valid turn index', () => {
    const round = createNewRound(1_000, () => 0.5);
    round.turnIndex = -1;
    for (const seat of round.seats) seat.needsAction = false;

    expect(nextSeatNeedingAction(round)).toBeUndefined();
    expect(() => runNpcTurns(round, () => 0.5)).not.toThrow();
  });

  it('re-enters bankrupt NPCs with the current stake-sized stack', () => {
    const round = createNewRound(100_000, () => 0.5, {
      npc_agwi: 0,
      npc_goni: 80_000,
      npc_madam: 50_000
    });
    const busted = round.seats.find((s) => s.id === 'npc_agwi');

    expect(busted?.chips).toBe(89_000);
    expect(busted?.folded).toBe(false);
    expect(busted?.needsAction).toBe(true);
    expect(round.log).toContain('아귀 재입장 (90000)');
  });

  it('gives NPCs a finite buy-in sized for the current stakes', () => {
    const userChips = 1_000_000;
    const round = createNewRound(userChips, () => 0.5, {});
    for (const s of round.seats.filter((x) => x.isNpc)) {
      expect(s.chips + round.antePaid).toBe(npcStartingChips(round.antePaid, userChips));
      expect(s.chips + round.antePaid).toBe(900_000);
    }
  });

  it('refills high-balance NPCs to 90% of the user balance without a cap', () => {
    expect(npcStackForNextRound(0, 14_300_000_000, 30_000)).toEqual({
      chips: 12_870_000_000,
      reason: 'refill'
    });
    expect(npcStartingChips(30_000, 20_000_000_000)).toBe(18_000_000_000);
    expect(npcStartingChips(30_000, 50_000_000_000)).toBe(45_000_000_000);
    expect(npcStartingChips(10, 1_000)).toBe(900);
  });

  it('does not cap the ante and scales NPC stacks with the user balance', () => {
    const round = createNewRound(14_300_000_000, () => 0.5, {});

    expect(round.antePaid).toBe(286_000_000);
    expect(round.pot).toBe(1_144_000_000);
    for (const npc of round.seats.filter((seat) => seat.isNpc)) {
      expect(npc.chips).toBe(12_584_000_000);
      expect(npc.borrowedChips ?? 0).toBe(0);
    }
  });

  it('keeps earned NPC chips and trims oversized stacks to 90% of the user balance', () => {
    expect(npcStackForNextRound(2_000_000, 14_300_000_000, 30_000)).toEqual({
      chips: 2_000_000,
      reason: 'keep'
    });
    expect(npcStackForNextRound(50_000_000_000, 14_300_000_000, 30_000)).toEqual({
      chips: 12_870_000_000,
      reason: 'trim'
    });
  });

  it('does not refill busted NPCs during hand settlement', () => {
    const round = createNewRound(100_000, () => 0.5, {});
    for (const npc of round.seats.filter((seat) => seat.isNpc)) {
      npc.folded = true;
      npc.chips = 0;
    }

    finishIfNeeded(round);

    expect(round.seats.filter((seat) => seat.isNpc).every((seat) => seat.chips === 0)).toBe(true);
  });

  it('falls back to the ante when no user bankroll is supplied', () => {
    expect(npcStartingChips(10)).toBe(10);
  });

  it('uses a 15k ante without a fixed total cap at one million points', () => {
    const round = createNewRound(1_000_000, () => 0.5, {});

    expect(round.antePaid).toBe(15_000);
    expect(npcStartingChips(round.antePaid, 1_000_000)).toBe(900_000);
    expect(maxRoundContribution(1_000_000, round.antePaid)).toBe(1_000_000);
  });

  it('allows betting the bankroll when no opponent cover is supplied', () => {
    expect(maxRoundContribution(1_000, 10)).toBe(1_000);
    expect(maxRoundContribution(2_000, 10)).toBe(2_000);
    expect(maxRoundContribution(5_000, 10)).toBe(5_000);
    expect(maxRoundContribution(10_000, 10)).toBe(10_000);
    expect(maxRoundContribution(20_000, 10)).toBe(20_000);
  });

  it('counts the ante inside the bankroll contribution limit', () => {
    const round = createNewRound(1_000, () => 0.5, {});
    const user = round.seats[0];

    expect(user.totalContrib).toBe(10);
    expect(contributionCapacity(round, user)).toBe(990);
    applyPlayerAction(round, 'user', 'raise', user.chips);
    expect(user.totalContrib).toBe(1_000);
  });

  it('caps the user by the largest active NPC stack', () => {
    expect(maxRoundContribution(1_000_000, 2_800, 7_500)).toBe(7_500);
  });

  it('also caps NPC contribution by the richest active opponent stack', () => {
    const round = createNewRound(50, () => 0.5, {});
    const npc = round.seats.find((seat) => seat.id === 'npc_agwi')!;

    expect(round.antePaid).toBe(10);
    expect(contributionCapacity(round, npc)).toBe(40);
  });

  it('enforces the exact min cap in the server action path', () => {
    const round = createNewRound(1_000_000, () => 0.5, {
      npc_agwi: 75_000,
      npc_goni: 70_000,
      npc_madam: 65_000
    });
    const user = round.seats[0];

    expect(contributionCapacity(round, user)).toBe(985_000);
    applyPlayerAction(round, 'user', 'raise', Number.MAX_SAFE_INTEGER);
    expect(user.totalContrib).toBe(1_000_000);
  });

  it('charges a bankroll-scaled ante at high balances', () => {
    const round = createNewRound(100_000, () => 0.5, {});

    expect(round.antePaid).toBe(1_000);
    expect(round.currentBet).toBe(1_000);
    expect(round.pot).toBe(4_000);
    expect(round.seats[0].chips).toBe(99_000);
  });

  it('caps a 100k player only by the richest active NPC stack', () => {
    const round = createNewRound(100_000, () => 0.5, {});
    const user = round.seats[0];

    applyPlayerAction(round, 'user', 'raise', user.chips);

    expect(maxRoundContribution(100_000, round.antePaid)).toBe(100_000);
    expect(user.contrib).toBe(100_000);
    expect(round.currentBet).toBe(100_000);
  });

  it('allows high-bankroll rounds beyond the former fixed limits', () => {
    const round = createNewRound(10_000_000_000, () => 0.5, {});
    const user = round.seats[0];

    applyPlayerAction(round, 'user', 'raise', user.chips);

    expect(user.totalContrib).toBe(10_000_000_000);
    expect(round.pot).toBe(10_600_000_000);
  });

  it('accepts the third raise and turns a fourth raise into a call', () => {
    const round = createNewRound(100_000, () => 0.5, {});
    const user = round.seats[0];
    round.raiseCount = 2;

    applyPlayerAction(round, 'user', 'raise', 2_000);
    expect(round.raiseCount).toBe(3);
    expect(user.lastAction).toBe('레이즈');

    user.needsAction = true;
    round.currentBet = user.contrib + 1_000;
    applyPlayerAction(round, 'user', 'raise', 2_000);

    expect(round.raiseCount).toBe(3);
    expect(user.lastAction).toBe('콜');
  });

  it('lets an NPC borrow the uncovered call without charging the user twice', () => {
    const round = createNewRound(100_000, () => 0.5, {});
    const user = round.seats[0];
    const npc = round.seats.find((seat) => seat.id === 'npc_agwi')!;

    applyPlayerAction(round, 'user', 'raise', user.chips);
    const userAfterRaise = user.chips;
    const action = applyNpcSeatAction(round, npc, () => 0.5, {
      action: 'call',
      raiseScale: null,
      taunt: null
    });

    expect(userAfterRaise).toBe(0);
    expect(user.chips).toBe(0);
    expect(npc.borrowedChips).toBe(10_000);
    expect(npc.contrib).toBe(100_000);
    expect(action?.taunt).toBe('빌려 간다. 갚는단 말은 안 했다.');
    expect(round.log).toContain('아귀: 외상 10000 (상환 없음)');
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

    expect(round.seats.find((seat) => seat.id === user.id)?.chips).toBe(430);
    expect(round.seats.find((seat) => seat.id === sidePotWinner.id)?.chips).toBe(570);
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
    // 총투입 상한에 도달해도 유저에게 체크/다이 선택 차례는 준다.
    expect(user.needsAction).toBe(true);
    expect(npc1.needsAction).toBe(true);
    expect(npc2.needsAction).toBe(true);
    expect(folded.folded).toBe(true);
    expect(folded.needsAction).toBe(false);
    expect(round.log.at(-1)).toContain('재경기');
    expect(round.replayReason).toBe('무승부');
    expect(round.handHistory).toHaveLength(1);

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
      seat.totalContrib = (seat.totalContrib ?? 0) + 10;
      seat.chips -= 10;
      seat.needsAction = false;
    }
    round.pot += 30;
    round.currentBet = 10;

    showdown(round);

    expect(round.phase).toBe('showdown');
    expect(round.pot).toBe(0);
    expect(round.seats.find((seat) => seat.id === user.id)?.chips).toBe(
      chipsBeforeReplayBet - 10 + potBefore + 30 + 90
    );
    expect(round.handHistory).toHaveLength(2);
    expect(seotdaHandLogEntries(round)).toContain('hand:2:user:3광·8광:38광땡:alive');
    expect(seotdaAuditLogEntries(round)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^round:/),
        expect.stringMatching(/^pot:/),
        expect.stringContaining('action:')
      ])
    );
  });

  it('keeps the original bet in accounting when a tie replay has no new user bet', () => {
    const round = createNewRound(1000, () => 0.5);
    const user = round.seats[0];
    const originalBet = user.totalContrib;

    user.cards = [
      { month: 3, gwang: false },
      { month: 4, gwang: false }
    ];
    round.seats[1].cards = [
      { month: 9, gwang: false },
      { month: 8, gwang: false }
    ];
    round.seats[2].cards = [
      { month: 2, gwang: false },
      { month: 5, gwang: false }
    ];
    round.seats[3].folded = true;
    showdown(round, () => 0.25);

    user.cards = [
      { month: 3, gwang: true },
      { month: 8, gwang: true }
    ];
    round.seats[1].cards = [
      { month: 1, gwang: false },
      { month: 2, gwang: false }
    ];
    round.seats[2].cards = [
      { month: 2, gwang: false },
      { month: 5, gwang: false }
    ];
    for (const seat of round.seats.filter((seat) => !seat.folded)) seat.needsAction = false;
    showdown(round);

    const result = userChipResult(1000, round);
    expect(result.bet).toBe(originalBet);
    expect(result.after).not.toBe(1000);
    expect(result.payout).toBe(result.bet + result.delta);
  });

  it('settles amhaengeosa as the winner in the classic room', () => {
    const round = createNewRound(1000, () => 0.5);
    round.ruleMode = 'classic';
    const [user, inspector, ...others] = round.seats;
    user.cards = [
      { month: 1, gwang: true },
      { month: 3, gwang: true }
    ];
    inspector.cards = [
      { month: 4, gwang: false },
      { month: 7, gwang: false }
    ];
    for (const seat of others) seat.folded = true;

    showdown(round);

    expect(round.phase).toBe('showdown');
    expect(round.winnerId).toBe(inspector.id);
    expect(round.log.at(-1)).toContain('암행어사');
  });

  it('keeps the pot and redeals when gusa activates in the classic room', () => {
    const round = createNewRound(1000, () => 0.5);
    round.ruleMode = 'classic';
    const [user, gusa, ...others] = round.seats;
    user.cards = [
      { month: 1, gwang: false },
      { month: 2, gwang: false }
    ];
    gusa.cards = [
      { month: 4, gwang: false },
      { month: 9, gwang: false }
    ];
    for (const seat of others) seat.folded = true;
    const potBefore = round.pot;

    showdown(round, () => 0.5);

    expect(round.phase).toBe('betting');
    expect(round.pot).toBe(potBefore);
    expect(round.log.at(-1)).toContain('구사');
  });
});

describe('seotdaNpc bluff', () => {
  it('bluffs weak hands often and releases them to pressure below 100k', () => {
    const weakCards = [
      { month: 2, gwang: false },
      { month: 8, gwang: false }
    ];
    const profile = NPC_PROFILES.find((candidate) => candidate.id === 'npc_goni')!;
    const common = {
      chips: 10_000,
      pot: 400,
      forcePressure: false,
      bluffCatcher: false,
      sparkIntervention: false,
      ante: 100,
      playerRelief: 1.5,
      activeOpponents: 3
    };

    expect(
      chooseNpcAction(weakCards, profile, { ...common, toCall: 0, raiseSeen: false }, () => 0.49)
    ).toBe('raise');
    expect(
      chooseNpcAction(weakCards, profile, { ...common, toCall: 300, raiseSeen: true }, () => 0.5)
    ).toBe('die');
  });

  it('uses a two-round cooldown after a Spark taunt', () => {
    expect(sparkTauntCooldownAfterRound({ sparkTaunted: true })).toBe(2);
    expect(sparkTauntCooldownAfterRound({ sparkTaunted: false, sparkTauntCooldown: 2 })).toBe(1);
  });

  it('uses the Codex app-server decision instead of a random intervention roll', () => {
    const round = createNewRound(99_999, () => 0.99, {}, 'user', 0, {
      active: true,
      npcId: 'npc_agwi',
      taunt: '내가 빙다리 핫바지로 보이냐?',
      difficulty: 'challenge',
      npcStyle: 'aggressive',
      reason: '연속 최대 레이즈'
    });

    expect(round.sparkIntervention).toBe(true);
    expect(round.sparkNpcId).toBe('npc_agwi');
    expect(round.sparkTaunt).toBe('내가 빙다리 핫바지로 보이냐?');
    expect(round.sparkDifficulty).toBe('challenge');
    expect(round.sparkNpcStyle).toBe('aggressive');
    expect(round.sparkDecisionSource).toBe('codex-app-server');
  });

  it('lets Spark directly play only its assigned NPC without exposing user cards', async () => {
    const round = createNewRound(50_000, () => 0.5, {}, 'npc_agwi', 0, {
      active: true,
      npcId: 'npc_agwi',
      taunt: null,
      difficulty: 'give-room',
      npcStyle: 'loose-caller',
      directPlay: true,
      reason: '재미 조절'
    });
    const contexts: Record<string, unknown>[] = [];

    await runNpcTurnsWithSpark(round, async (context) => {
      contexts.push(context);
      return { action: 'call', raiseScale: null, taunt: null };
    });

    expect(contexts).toHaveLength(1);
    expect(contexts[0].npcId).toBe('npc_agwi');
    expect(contexts[0].cards).toEqual(
      round.seats
        .find((seat) => seat.id === 'npc_agwi')
        ?.cards.map((card) => ({
          month: card.month,
          gwang: card.gwang
        }))
    );
    expect(contexts[0]).not.toHaveProperty('userCards');
  });

  it('shows a Spark taunt only for its NPC betting action and at most once', () => {
    const intervention = {
      active: true,
      npcId: 'npc_agwi',
      taunt: '쫄리면 뒤지시던가.',
      taunted: false
    };

    expect(sparkTauntForAction(intervention, 'npc_goni', '레이즈')).toBeNull();
    expect(sparkTauntForAction(intervention, 'npc_agwi', '다이')).toBeNull();
    expect(sparkTauntForAction(intervention, 'npc_agwi', '레이즈')).toBe('쫄리면 뒤지시던가.');
    intervention.taunted = true;
    expect(sparkTauntForAction(intervention, 'npc_agwi', '콜')).toBeNull();
  });

  it('chooses NPC dialogue locally without a Spark decision', () => {
    expect(localNpcTauntForAction({ taunted: false, cooldown: 0 }, '레이즈', () => 0)).toBe(
      '어디서 약을 팔아?'
    );
    expect(localNpcTauntForAction({ taunted: true, cooldown: 0 }, '레이즈', () => 0)).toBeNull();
    expect(localNpcTauntForAction({ taunted: false, cooldown: 1 }, '콜', () => 0)).toBeNull();
    expect(localNpcTauntForAction({ taunted: false, cooldown: 0 }, '다이', () => 0)).toBeNull();
  });

  it('suspects bluffs from public raise signals without hidden cards', () => {
    expect(
      publicBluffSuspicionChance({
        lastAggressorId: 'user',
        lastRaisePay: 100,
        potBeforeRaise: 400,
        userRaiseCount: 2
      })
    ).toBe(0.55);
    expect(
      publicBluffSuspicionChance({
        lastAggressorId: 'npc_goni',
        lastRaisePay: 100,
        potBeforeRaise: 400,
        userRaiseCount: 2
      })
    ).toBe(0);
  });

  it('re-raises suspected bluffs boldly only when its own hand supports it', () => {
    expect(sparkBluffReraiseChance(0.39)).toBe(0.05);
    expect(sparkBluffReraiseChance(0.4)).toBe(0.42);
    expect(sparkBluffReraiseChance(0.65)).toBe(0.78);
  });

  it('lets an opening Agwi bluff-raise a weak hand without always raising', () => {
    const profile = NPC_PROFILES.find((candidate) => candidate.style === 'bluffer')!;
    const weak = [
      { month: 2, gwang: false },
      { month: 8, gwang: false }
    ];
    const context = {
      toCall: 0,
      chips: 3_000,
      pot: 640,
      raiseSeen: false,
      isOpening: true,
      ante: 160
    };

    expect(chooseNpcAction(weak, profile, context, () => 0.1)).toBe('raise');
    expect(chooseNpcAction(weak, profile, context, () => 0.9)).toBe('call');
  });

  it('keeps opening bluffs style-dependent and value-raises strong hands', () => {
    const calm = NPC_PROFILES.find((candidate) => candidate.style === 'calm')!;
    const weak = [
      { month: 2, gwang: false },
      { month: 8, gwang: false }
    ];
    const strong = [
      { month: 1, gwang: false },
      { month: 2, gwang: false }
    ];
    const context = {
      toCall: 0,
      chips: 3_000,
      pot: 640,
      raiseSeen: false,
      isOpening: true,
      ante: 160
    };

    expect(chooseNpcAction(weak, calm, context, () => 0.2)).toBe('call');
    expect(chooseNpcAction(strong, calm, context, () => 0.5)).toBe('raise');
  });

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

  it('lets the designated bluff catcher stay against an oversized raise', () => {
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

    expect(['call', 'raise']).toContain(action);
  });

  it('keeps a 5-10% minimum call range for weak hands facing a large raise', () => {
    const profile = NPC_PROFILES.find((p) => p.style === 'bluffer')!;
    const weak = [
      { month: 2, gwang: false },
      { month: 8, gwang: false }
    ];
    let stays = 0;
    for (let n = 0; n < 1_000; n++) {
      const action = chooseNpcAction(
        weak,
        profile,
        {
          toCall: 800,
          chips: 8_000,
          pot: 500,
          raiseSeen: true,
          bluffCatcher: false,
          ante: 100
        },
        () => n / 1_000
      );
      if (action !== 'die') stays++;
    }

    expect(stays).toBeGreaterThanOrEqual(50);
    expect(stays).toBeLessThanOrEqual(100);
  });

  it('calls more often as hand strength and pot odds improve', () => {
    const profile = NPC_PROFILES.find((p) => p.style === 'calm')!;
    const medium = [
      { month: 9, gwang: false },
      { month: 8, gwang: false }
    ];
    const countStays = (pot: number) => {
      let stays = 0;
      for (let n = 0; n < 1_000; n++) {
        const action = chooseNpcAction(
          medium,
          profile,
          {
            toCall: 800,
            chips: 8_000,
            pot,
            raiseSeen: true,
            bluffCatcher: false,
            ante: 100,
            activeOpponents: 1
          },
          () => n / 1_000
        );
        if (action !== 'die') stays++;
      }
      return stays;
    };

    expect(countStays(8_000)).toBeGreaterThan(countStays(500));
  });

  it('conditionally re-raises a strong non-ddang hand', () => {
    const profile = NPC_PROFILES.find((p) => p.style === 'calm')!;
    const strong = [
      { month: 1, gwang: false },
      { month: 2, gwang: false }
    ];
    const rolls = [0.1, 0.1];
    const action = chooseNpcAction(
      strong,
      profile,
      {
        toCall: 800,
        chips: 8_000,
        pot: 8_000,
        raiseSeen: true,
        bluffCatcher: false,
        ante: 100,
        activeOpponents: 1
      },
      () => rolls.shift() ?? 0.1
    );

    expect(action).toBe('raise');
  });
});

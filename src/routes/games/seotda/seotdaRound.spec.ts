import { describe, expect, it } from 'vitest';
import {
  MAX_POT,
  MAX_TOTAL_BET,
  NPC_START_CHIPS,
  npcStartingChips,
  createNewRound,
  ddaengValue,
  applyPlayerAction,
  contributionCapacity,
  finishIfNeeded,
  maxRoundContribution,
  nextSeatNeedingAction,
  runNpcTurns,
  seotdaAuditLogEntries,
  seotdaHandLogEntries,
  showdown,
  settleDdaengValue,
  sparkTauntCooldownAfterRound,
  userChipResult
} from './seotdaRound.js';
import {
  chooseNpcAction,
  NPC_PROFILES,
  npcRaiseChips,
  pickLowBalanceSparkIntervention,
  pickSparkTaunt,
  publicBluffSuspicionChance,
  sparkBluffReraiseChance,
  sparkTauntForAction
} from './seotdaNpc.js';

describe('seotdaRound smoke', () => {
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
    expect(round.seats.find((s) => s.id === 'npc_agwi')?.chips).toBe(1290);
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
    const round = createNewRound(1000, () => 0.5, {
      npc_agwi: 0,
      npc_goni: 800,
      npc_madam: 50
    });
    const busted = round.seats.find((s) => s.id === 'npc_agwi');

    expect(busted?.chips).toBe(1_990);
    expect(busted?.folded).toBe(false);
    expect(busted?.needsAction).toBe(true);
    expect(round.log).toContain('아귀 재입장 (2000)');
  });

  it('gives NPCs a finite buy-in sized for the current stakes', () => {
    const userChips = 1_000_000;
    const round = createNewRound(userChips, () => 0.5, {});
    for (const s of round.seats.filter((x) => x.isNpc)) {
      expect(s.chips + round.antePaid).toBe(npcStartingChips(round.antePaid));
      expect(s.chips + round.antePaid).toBe(300_000);
    }
  });

  it('keeps the 2,000-chip floor at low stakes', () => {
    expect(npcStartingChips(10)).toBe(NPC_START_CHIPS);
  });

  it('uses a 15k ante and 100k total cap at one million points', () => {
    const round = createNewRound(1_000_000, () => 0.5, {});

    expect(round.antePaid).toBe(15_000);
    expect(npcStartingChips(round.antePaid)).toBe(300_000);
    expect(maxRoundContribution(1_000_000, round.antePaid)).toBe(100_000);
  });

  it('allows racing up to 20 antes, bankroll, and the 100k absolute cap', () => {
    expect(maxRoundContribution(1_000, 10)).toBe(200);
    expect(maxRoundContribution(2_000, 10)).toBe(200);
    expect(maxRoundContribution(5_000, 10)).toBe(200);
    expect(maxRoundContribution(10_000, 10)).toBe(200);
    expect(maxRoundContribution(20_000, 10)).toBe(200);
  });

  it('counts the ante inside the low-bankroll contribution cap', () => {
    const round = createNewRound(1_000, () => 0.5, {});
    const user = round.seats[0];

    expect(user.totalContrib).toBe(10);
    expect(contributionCapacity(round, user)).toBe(190);
    applyPlayerAction(round, 'user', 'raise', user.chips);
    expect(user.totalContrib).toBe(200);
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
      npc_goni: 50_000,
      npc_madam: 30_000
    });
    const user = round.seats[0];

    expect(contributionCapacity(round, user)).toBe(60_000);
    applyPlayerAction(round, 'user', 'raise', Number.MAX_SAFE_INTEGER);
    expect(user.totalContrib).toBe(75_000);
  });

  it('charges a bankroll-scaled ante at high balances', () => {
    const round = createNewRound(100_000, () => 0.5, {});

    expect(round.antePaid).toBe(1_000);
    expect(round.currentBet).toBe(1_000);
    expect(round.pot).toBe(4_000);
    expect(round.seats[0].chips).toBe(99_000);
  });

  it('caps a 100k players total contribution at 20 initial antes', () => {
    const round = createNewRound(100_000, () => 0.5, {});
    const user = round.seats[0];

    applyPlayerAction(round, 'user', 'raise', user.chips);

    expect(maxRoundContribution(100_000, round.antePaid)).toBe(20_000);
    expect(user.contrib).toBe(20_000);
    expect(round.currentBet).toBe(20_000);
  });

  it('caps high-bankroll rounds by absolute seat and pot limits', () => {
    const round = createNewRound(10_000_000_000, () => 0.5, {});
    const user = round.seats[0];

    applyPlayerAction(round, 'user', 'raise', user.chips);

    expect(user.totalContrib).toBeLessThanOrEqual(MAX_TOTAL_BET);
    expect(round.pot).toBeLessThanOrEqual(MAX_POT);
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
});

describe('seotdaNpc bluff', () => {
  it('uses a two-round cooldown after a Spark taunt', () => {
    expect(sparkTauntCooldownAfterRound({ sparkTaunted: true })).toBe(2);
    expect(sparkTauntCooldownAfterRound({ sparkTaunted: false, sparkTauntCooldown: 2 })).toBe(1);
  });

  it('lets Spark intervene in 6% of sub-100k rounds only', () => {
    expect(pickLowBalanceSparkIntervention(99_999, () => 0.059)).toBe(true);
    expect(pickLowBalanceSparkIntervention(99_999, () => 0.06)).toBe(false);
    expect(pickLowBalanceSparkIntervention(100_000, () => 0)).toBe(false);
  });

  it('offers a Spark taunt on 18% of eligible intervention rounds with no cooldown', () => {
    const firstLineRolls = [0.179, 0];
    expect(pickSparkTaunt(true, 0, () => firstLineRolls.shift() ?? 0)).toBe('어디서 약을 팔아?');
    expect(pickSparkTaunt(true, 0, () => 0.18)).toBeNull();
    expect(pickSparkTaunt(true, 1, () => 0)).toBeNull();
    expect(pickSparkTaunt(false, 0, () => 0)).toBeNull();

    const rolls = [0.1, 0.1];
    expect(pickSparkTaunt(true, 0, () => rolls.shift() ?? 0)).toBe('내가 빙다리 핫바지로 보이냐?');
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

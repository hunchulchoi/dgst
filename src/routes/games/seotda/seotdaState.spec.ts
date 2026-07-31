import { describe, expect, it } from 'vitest';
import { toPublicState } from './seotdaState.js';
import { evaluateHand } from './seotdaEngine.js';

describe('toPublicState hide NPC when user folded', () => {
  it('publishes only the boss dori cards before showdown', () => {
    const round = /** @type {import('./seotdaState.js').SeotdaRound} */ {
      phase: 'betting',
      pot: 20,
      currentBet: 10,
      turnIndex: 0,
      pressureNpcId: null,
      log: [],
      winnerId: null,
      showdown: false,
      antePaid: 10,
      series: { isBoss: true, bossNpcId: 'boss' },
      seats: [
        {
          id: 'user',
          name: '나',
          isNpc: false,
          chips: 990,
          cards: [
            { month: 1, gwang: false },
            { month: 2, gwang: false },
            { month: 3, gwang: false },
            { month: 4, gwang: false },
            { month: 10, gwang: false }
          ],
          doriIndices: null,
          folded: false,
          contrib: 10,
          lastAction: null,
          needsAction: true
        },
        {
          id: 'boss',
          name: '보스',
          isNpc: true,
          chips: 990,
          cards: [
            { month: 1, gwang: true },
            { month: 2, gwang: false },
            { month: 3, gwang: false },
            { month: 7, gwang: false },
            { month: 9, gwang: false }
          ],
          doriIndices: [0, 1, 3],
          resultCards: [
            { month: 3, gwang: false },
            { month: 9, gwang: false }
          ],
          folded: false,
          contrib: 10,
          lastAction: null,
          needsAction: true
        }
      ]
    };

    const boss = toPublicState(round, 'user', evaluateHand).seats.find(
      (seat) => seat.id === 'boss'
    );
    expect(boss?.doriIndices).toEqual([0, 1, 3]);
    expect(boss?.cards.map((card) => card.month)).toEqual([1, 2, 0, 7, 0]);
  });

  it('does not reveal NPC cards if user died', () => {
    const round = /** @type {import('./seotdaState.js').SeotdaRound} */ {
      phase: /** @type {'showdown'} */ 'showdown',
      pot: 0,
      currentBet: 40,
      turnIndex: 0,
      pressureNpcId: null,
      log: [],
      winnerId: 'npc_agwi',
      winnerIds: ['npc_agwi'],
      showdown: true,
      userChipsBefore: 1000,
      userChipsAfter: 900,
      userChipDelta: -100,
      antePaid: 10,
      seats: [
        {
          id: 'user',
          name: '나',
          isNpc: false,
          chips: 900,
          cards: [
            { month: 3, gwang: false },
            { month: 4, gwang: false }
          ],
          folded: true,
          contrib: 10,
          lastAction: '다이',
          needsAction: false
        },
        {
          id: 'npc_agwi',
          name: '아귀',
          isNpc: true,
          chips: 1100,
          cards: [
            { month: 9, gwang: false },
            { month: 8, gwang: true }
          ],
          folded: false,
          contrib: 40,
          lastAction: '콜',
          lastActionAmount: 30,
          needsAction: false
        }
      ]
    };
    const pub = toPublicState(round, 'user', evaluateHand);
    expect(pub.revealNpcHands).toBe(false);
    const npc = pub.seats.find((s) => s.id === 'npc_agwi');
    expect(npc?.cards.every((c) => c.hidden || c.month === 0)).toBe(true);
    expect(npc?.handName).toBeNull();
    expect(npc?.lastActionAmount).toBe(30);
    expect(pub.userChipsBefore).toBe(1000);
    expect(pub.userChipsAfter).toBe(900);
    expect(pub.userChipDelta).toBe(-100);
  });

  it('reveals NPC cards when user stayed in', () => {
    const round = {
      phase: /** @type {'showdown'} */ 'showdown',
      pot: 0,
      currentBet: 40,
      turnIndex: 0,
      pressureNpcId: null,
      log: [],
      winnerId: 'user',
      winnerIds: ['user'],
      showdown: true,
      antePaid: 10,
      seats: [
        {
          id: 'user',
          name: '나',
          isNpc: false,
          chips: 1100,
          cards: [
            { month: 3, gwang: false },
            { month: 4, gwang: false }
          ],
          folded: false,
          contrib: 40,
          lastAction: '콜',
          needsAction: false
        },
        {
          id: 'npc_agwi',
          name: '아귀',
          isNpc: true,
          chips: 900,
          cards: [
            { month: 2, gwang: false },
            { month: 5, gwang: false }
          ],
          folded: false,
          contrib: 40,
          lastAction: '콜',
          needsAction: false
        }
      ]
    };
    const pub = toPublicState(round, 'user', evaluateHand);
    expect(pub.revealNpcHands).toBe(true);
    const npc = pub.seats.find((s) => s.id === 'npc_agwi');
    expect(npc?.cards[0].month).toBe(2);
    expect(npc?.handName).toBeTruthy();
  });

  it('reveals only the winning ddaeng when the user folded', () => {
    const round = /** @type {import('./seotdaState.js').SeotdaRound} */ {
      phase: /** @type {'showdown'} */ 'showdown',
      pot: 0,
      currentBet: 100,
      turnIndex: 0,
      pressureNpcId: null,
      log: [],
      winnerId: 'npc_agwi',
      winnerIds: ['npc_agwi'],
      ddaengWinnerId: 'npc_agwi',
      ddaengHandName: '장땡',
      ddaengValuePerLoser: 200,
      showdown: true,
      antePaid: 100,
      seats: [
        {
          id: 'user',
          name: '나',
          isNpc: false,
          chips: 800,
          cards: [
            { month: 3, gwang: false },
            { month: 4, gwang: false }
          ],
          folded: true,
          contrib: 100,
          lastAction: '다이',
          needsAction: false
        },
        {
          id: 'npc_agwi',
          name: '아귀',
          isNpc: true,
          chips: 1400,
          cards: [
            { month: 10, gwang: false },
            { month: 10, gwang: false }
          ],
          folded: false,
          contrib: 100,
          lastAction: '콜',
          needsAction: false
        },
        {
          id: 'npc_goni',
          name: '고니',
          isNpc: true,
          chips: 800,
          cards: [
            { month: 1, gwang: false },
            { month: 2, gwang: false }
          ],
          folded: false,
          contrib: 100,
          lastAction: '콜',
          needsAction: false
        }
      ]
    };

    const pub = toPublicState(round, 'user', evaluateHand);
    const agwi = pub.seats.find((seat) => seat.id === 'npc_agwi');
    const goni = pub.seats.find((seat) => seat.id === 'npc_goni');
    expect(pub.revealNpcHands).toBe(false);
    expect(agwi?.cards[0].month).toBe(10);
    expect(agwi?.handName).toBe('장땡');
    expect(agwi?.revealDdaeng).toBe(true);
    expect(goni?.cards.every((card) => card.month === 0)).toBe(true);
    expect(goni?.handName).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { toPublicState } from './seotdaState.js';
import { evaluateHand } from './seotdaEngine.js';

describe('toPublicState hide NPC when user folded', () => {
  it('does not reveal NPC cards if user died', () => {
    const round = {
      phase: /** @type {'showdown'} */ 'showdown',
      pot: 0,
      currentBet: 40,
      turnIndex: 0,
      pressureNpcId: null,
      log: [],
      winnerId: 'npc_agwi',
      winnerIds: ['npc_agwi'],
      showdown: true,
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
});

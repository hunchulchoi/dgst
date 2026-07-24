import { describe, expect, it } from 'vitest';
import { emotionView, nextNpcEmotions } from './seotdaEmotion.js';
import { chooseNpcAction, NPC_PROFILES } from './seotdaNpc.js';

const npcSeats = [
  { id: 'npc_agwi', isNpc: true, folded: false },
  { id: 'npc_goni', isNpc: true, folded: true },
  { id: 'npc_madam', isNpc: true, folded: false }
];

describe('seotda NPC emotions', () => {
  it('builds revenge when the user wins aggressively', () => {
    const next = nextNpcEmotions(
      {},
      {
        winnerId: 'user',
        winnerIds: ['user'],
        userRaiseCount: 2,
        seats: npcSeats
      }
    );

    expect(next.npc_agwi).toMatchObject({ heat: 2, confidence: 0 });
    expect(next.npc_goni).toMatchObject({ heat: 1, confidence: 0 });
    expect(emotionView(next.npc_agwi)).toMatchObject({
      mood: '벼르는 중',
      revenge: true,
      aggression: 2
    });
  });

  it('gives the winning NPC confidence and cools old revenge', () => {
    const next = nextNpcEmotions(
      {
        npc_agwi: { heat: 3, confidence: 0 },
        npc_goni: { heat: 1, confidence: 1 }
      },
      {
        winnerId: 'npc_agwi',
        winnerIds: ['npc_agwi'],
        userRaiseCount: 0,
        seats: npcSeats
      }
    );

    expect(next.npc_agwi).toEqual({ heat: 2, confidence: 1 });
    expect(next.npc_goni).toEqual({ heat: 0, confidence: 0 });
    expect(emotionView(next.npc_agwi).mood).toBe('벼르는 중');
  });

  it('caps emotion values and exposes a visible revenge line', () => {
    const next = nextNpcEmotions(
      { npc_madam: { heat: 3, confidence: 2 } },
      {
        winnerId: 'user',
        winnerIds: ['user'],
        userRaiseCount: 3,
        seats: npcSeats
      }
    );
    const view = emotionView(next.npc_madam);

    expect(next.npc_madam).toEqual({ heat: 3, confidence: 1 });
    expect(view).toMatchObject({
      mood: '복수심 폭발',
      revenge: true,
      aggression: 3
    });
    expect(view.line).toContain('안 물러');
  });

  it('turns revenge into additional opening aggression', () => {
    const calm = NPC_PROFILES.find((profile) => profile.style === 'calm');
    const cards = [
      { month: 1, gwang: false },
      { month: 3, gwang: false }
    ];
    const context = {
      toCall: 0,
      chips: 1000,
      pot: 40,
      raiseSeen: false,
      isOpening: true,
      activeOpponents: 3,
      playerRelief: 0,
      emotionAggression: 2,
      emotionRevenge: true
    };

    expect(chooseNpcAction(cards, calm!, context, () => 0.15)).toBe('raise');
    expect(
      chooseNpcAction(
        cards,
        calm!,
        { ...context, emotionAggression: 0, emotionRevenge: false },
        () => 0.15
      )
    ).toBe('call');
  });
});

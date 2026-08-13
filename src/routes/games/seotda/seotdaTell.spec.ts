// @ts-nocheck -- Hidden-card response fixtures are runtime-only projections.
import { describe, expect, it } from 'vitest';
import { createNpcTell } from './seotdaTell.js';
import { createNewRound } from './seotdaRound.js';
import { toPublicState } from './seotdaState.js';

describe('seotda NPC tells', () => {
  const strong = [
    { month: 3, gwang: true },
    { month: 8, gwang: true }
  ];
  const weak = [
    { month: 2, gwang: false },
    { month: 8, gwang: false }
  ];

  it('usually exposes a useful but non-specific signal', () => {
    expect(createNpcTell(strong, 'calm', null, () => 0)).toMatchObject({
      signal: 'strong',
      label: '강한 기색'
    });
    expect(createNpcTell(weak, 'calm', null, () => 0)).toMatchObject({
      signal: 'weak',
      label: '흔들림'
    });
  });

  it('can deliberately show the opposite signal', () => {
    expect(createNpcTell(strong, 'bluffer', null, () => 0.99).signal).toBe('weak');
    expect(createNpcTell(weak, 'gambler', null, () => 0.99).signal).toBe('strong');
  });

  it('publishes tells without exposing hidden NPC cards', () => {
    const round = createNewRound(1000, () => 0.5);
    const publicRound = toPublicState(round);
    const npcs = publicRound.seats.filter((seat) => seat.isNpc);

    expect(npcs.every((seat) => seat.tell?.text)).toBe(true);
    expect(npcs.every((seat) => seat.cards.every((card) => card.hidden))).toBe(true);
  });
});

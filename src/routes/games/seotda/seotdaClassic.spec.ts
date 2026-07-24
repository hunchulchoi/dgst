import { describe, expect, it } from 'vitest';
import { displayHand, resolveHandOutcome } from './seotdaClassic.js';

const hand = (
  id: string,
  cards: Array<{ month: number; gwang?: boolean }>
) => ({
  id,
  cards: cards.map((card) => ({ month: card.month, gwang: !!card.gwang }))
});

describe('seotda classic special hands', () => {
  it('keeps the light-room outcome unchanged', () => {
    const outcome = resolveHandOutcome(
      [
        hand('gwang', [
          { month: 1, gwang: true },
          { month: 3, gwang: true }
        ]),
        hand('secret', [{ month: 4 }, { month: 7 }])
      ],
      'basic'
    );

    expect(outcome).toMatchObject({ type: 'win', winnerIds: ['gwang'], handName: '13광땡' });
  });

  it('lets amhaengeosa catch 13/18 gwang-ddaeng but not 38', () => {
    const caught = resolveHandOutcome(
      [
        hand('gwang', [
          { month: 1, gwang: true },
          { month: 8, gwang: true }
        ]),
        hand('secret', [{ month: 4 }, { month: 7 }])
      ],
      'classic'
    );
    const escaped = resolveHandOutcome(
      [
        hand('gwang', [
          { month: 3, gwang: true },
          { month: 8, gwang: true }
        ]),
        hand('secret', [{ month: 4 }, { month: 7 }])
      ],
      'classic'
    );

    expect(caught).toMatchObject({
      type: 'win',
      winnerIds: ['secret'],
      handName: '암행어사'
    });
    expect(escaped).toMatchObject({ winnerIds: ['gwang'], handName: '38광땡' });
  });

  it('lets ddaengjabi catch 1-9 ddaeng but not jang-ddaeng', () => {
    const caught = resolveHandOutcome(
      [hand('ddaeng', [{ month: 9 }, { month: 9 }]), hand('catcher', [{ month: 3 }, { month: 7 }])],
      'classic'
    );
    const escaped = resolveHandOutcome(
      [
        hand('ddaeng', [{ month: 10 }, { month: 10 }]),
        hand('catcher', [{ month: 3 }, { month: 7 }])
      ],
      'classic'
    );

    expect(caught).toMatchObject({ winnerIds: ['catcher'], handName: '땡잡이' });
    expect(escaped).toMatchObject({ winnerIds: ['ddaeng'], handName: '장땡' });
  });

  it('replays on gusa when the best ordinary hand is alli or lower', () => {
    const replay = resolveHandOutcome(
      [hand('alli', [{ month: 1 }, { month: 2 }]), hand('gusa', [{ month: 4 }, { month: 9 }])],
      'classic'
    );
    const noReplay = resolveHandOutcome(
      [
        hand('ddaeng', [{ month: 2 }, { month: 2 }]),
        hand('gusa', [{ month: 4 }, { month: 9 }])
      ],
      'classic'
    );

    expect(replay).toMatchObject({ type: 'replay', handName: '구사' });
    expect(noReplay).toMatchObject({ type: 'win', winnerIds: ['ddaeng'] });
  });

  it('shows special names only in the classic room', () => {
    const cards = [
      { month: 4, gwang: false },
      { month: 7, gwang: false }
    ];
    expect(displayHand(cards, 'classic').name).toBe('암행어사');
    expect(displayHand(cards, 'basic').name).toBe('1끗');
  });
});

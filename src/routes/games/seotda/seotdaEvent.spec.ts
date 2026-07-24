import { describe, expect, it } from 'vitest';
import { eventForSeries, roundRaiseLimit } from './seotdaEvent.js';
import { applyPlayerAction, createNewRound } from './seotdaRound.js';

describe('seotda series events', () => {
  it('assigns a different public rule to each regular hand', () => {
    expect(eventForSeries({ handNo: 1 }, true)).toMatchObject({
      id: 'scout',
      maxRaises: 2
    });
    expect(eventForSeries({ handNo: 2 }, true)).toMatchObject({
      id: 'lightning',
      maxRaises: 1
    });
    expect(eventForSeries({ handNo: 3 }, true)).toMatchObject({
      id: 'high-roller',
      anteMultiplier: 2
    });
    expect(eventForSeries({ handNo: 4 }, true)).toMatchObject({
      id: 'frenzy',
      maxRaises: 5
    });
  });

  it('does not alter disabled games or the boss hand', () => {
    expect(eventForSeries({ handNo: 2 }, false)).toBeNull();
    expect(eventForSeries({ handNo: 5, isBoss: true }, true)).toBeNull();
  });

  it('uses the event raise cap with a safe fallback', () => {
    expect(roundRaiseLimit({ event: { maxRaises: 1 } }, 3)).toBe(1);
    expect(roundRaiseLimit({ event: null }, 3)).toBe(3);
  });

  it('doubles the ante on the third event hand', () => {
    const series = {
      handNo: 3,
      isBoss: false,
      bossNpcId: null,
      anteMultiplier: 1,
      completed: 2,
      userWins: 1,
      npcWins: 1
    };

    expect(createNewRound(1000, () => 0.5, {}, 'user', 0, null, {}, series, 'basic', true))
      .toMatchObject({
        antePaid: 20,
        eventMode: true,
        event: { id: 'high-roller' }
      });
    expect(
      createNewRound(1000, () => 0.5, {}, 'user', 0, null, {}, series, 'basic', false).antePaid
    ).toBe(10);
  });

  it('converts an extra raise into a call after the event cap', () => {
    const series = {
      handNo: 2,
      isBoss: false,
      bossNpcId: null,
      anteMultiplier: 1,
      completed: 1,
      userWins: 0,
      npcWins: 1
    };
    const round = createNewRound(
      1000,
      () => 0.5,
      {},
      'user',
      0,
      null,
      {},
      series,
      'basic',
      true
    );
    const user = round.seats[0];

    applyPlayerAction(round, 'user', 'raise', 20);
    expect(round.raiseCount).toBe(1);
    user.needsAction = true;
    applyPlayerAction(round, 'user', 'raise', 20);

    expect(round.raiseCount).toBe(1);
    expect(user.lastAction).not.toBe('레이즈');
    expect(round.log.at(-1)).toContain('레이즈 상한');
  });
});

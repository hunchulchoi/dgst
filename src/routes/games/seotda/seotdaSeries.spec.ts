import { describe, expect, it } from 'vitest';
import { advanceSeries, createSeries, publicSeries, seriesRoundConfig } from './seotdaSeries.js';
import { createNewRound } from './seotdaRound.js';

const seats = [
  { id: 'user', isNpc: false },
  { id: 'npc_agwi', isNpc: true },
  { id: 'npc_goni', isNpc: true },
  { id: 'npc_madam', isNpc: true }
];

const finishedRound = (winnerId: string, isBoss = false) => ({
  winnerId,
  winnerIds: [winnerId],
  showdown: true,
  seats,
  series: { isBoss }
});

describe('seotda five-hand series', () => {
  it('tracks four regular hands and selects the NPC with most wins as boss', () => {
    let series = createSeries();
    series = advanceSeries(series, finishedRound('user'));
    series = advanceSeries(series, finishedRound('npc_goni'));
    series = advanceSeries(series, finishedRound('npc_goni'));
    series = advanceSeries(series, finishedRound('npc_agwi'));

    expect(series).toMatchObject({
      completed: 4,
      userWins: 1,
      npcWins: { npc_goni: 2, npc_agwi: 1 }
    });
    expect(seriesRoundConfig(series)).toMatchObject({
      handNo: 5,
      isBoss: true,
      bossNpcId: 'npc_goni',
      anteMultiplier: 2
    });
  });

  it('starts a fresh run after the boss hand', () => {
    const series = {
      completed: 4,
      userWins: 2,
      npcWins: { npc_agwi: 2, npc_goni: 0, npc_madam: 0 }
    };

    expect(advanceSeries(series, finishedRound('user', true))).toEqual(createSeries());
  });

  it('includes the current showdown in the public scoreboard', () => {
    const round = {
      ...finishedRound('user'),
      series: {
        handNo: 3,
        isBoss: false,
        bossNpcId: null,
        anteMultiplier: 1,
        completed: 2,
        userWins: 1,
        npcWins: 1
      }
    };

    expect(publicSeries(round)).toMatchObject({
      handNo: 3,
      completed: 3,
      userWins: 2,
      npcWins: 1
    });
  });

  it('creates the fifth hand as a heads-up double-ante boss table', () => {
    const config = seriesRoundConfig({
      completed: 4,
      userWins: 2,
      npcWins: { npc_agwi: 1, npc_goni: 2, npc_madam: 1 }
    });
    const round = createNewRound(1000, () => 0.5, {}, 'user', 0, null, {}, config);

    expect(round.antePaid).toBe(20);
    expect(round.seats.map((seat) => seat.id)).toEqual(['user', 'npc_goni']);
    expect(round.series).toMatchObject({ handNo: 5, isBoss: true, bossNpcId: 'npc_goni' });
  });
});

import { describe, expect, it } from 'vitest';
import {
  BILLIARDS_MODES,
  FOUR_BALL_CHANCES,
  evaluateFourBallShot,
  isActiveBilliardsMode,
  isValidScore,
  stopped
} from './gameUtils';

describe('billiards game helpers', () => {
  it('scores a four-ball shot after the cue ball contacts both red balls', () => {
    const result = evaluateFourBallShot([
      { cueRole: 'red', targetId: 'red-1' },
      { cueRole: 'red', targetId: 'red-2' }
    ]);

    expect(result.scored).toBe(true);
    expect(result.hitRedIds).toEqual(['red-1', 'red-2']);
  });

  it('does not score a four-ball shot after only one red ball contact', () => {
    const result = evaluateFourBallShot([{ cueRole: 'red', targetId: 'red-1' }]);

    expect(result.scored).toBe(false);
    expect(result.hitRedIds).toEqual(['red-1']);
  });

  it('treats balls as stopped only when every speed is under the threshold', () => {
    expect(stopped([{ speed: 0.01 }, { speed: 0.03 }], 0.05)).toBe(true);
    expect(stopped([{ speed: 0.01 }, { speed: 0.08 }], 0.05)).toBe(false);
  });

  it('accepts only active four-ball submissions for now', () => {
    expect(BILLIARDS_MODES.FOUR_BALL).toBe('four-ball');
    expect(FOUR_BALL_CHANCES).toBeGreaterThan(0);
    expect(isActiveBilliardsMode('four-ball')).toBe(true);
    expect(isActiveBilliardsMode('three-cushion')).toBe(false);
    expect(isActiveBilliardsMode('pool')).toBe(false);
  });

  it('validates persisted scores as non-negative safe integers', () => {
    expect(isValidScore(0)).toBe(true);
    expect(isValidScore(12)).toBe(true);
    expect(isValidScore(-1)).toBe(false);
    expect(isValidScore(1.5)).toBe(false);
    expect(isValidScore(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  BILLIARDS_MODES,
  BALL_FRICTION_AIR,
  BALL_RESTITUTION,
  FOUR_BALL_CHANCES,
  MAX_SHOT_SPEED,
  RAIL_RESTITUTION,
  computeBreathingAimAngle,
  containBallInTable,
  computeShotVelocity,
  computeSpinFromTrack,
  computeSweepingPower,
  computeTouchSpin,
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

  it('keeps fast balls inside the billiards table bounds', () => {
    expect(
      containBallInTable({
        position: { x: -12, y: 120 },
        velocity: { x: -18, y: 2 }
      })
    ).toEqual({
      corrected: true,
      position: { x: 28, y: 120 },
      velocity: { x: 18, y: 2 }
    });

    expect(
      containBallInTable({
        position: { x: 370, y: 570 },
        velocity: { x: 16, y: 14 }
      })
    ).toEqual({
      corrected: true,
      position: { x: 332, y: 532 },
      velocity: { x: -16, y: -14 }
    });
  });

  it('computes shot velocity from independent angle and power controls', () => {
    expect(computeShotVelocity(0, 50)).toEqual({ x: 15, y: 0 });
    expect(computeShotVelocity(Math.PI / 2, 100).x).toBeCloseTo(0);
    expect(computeShotVelocity(Math.PI / 2, 100).y).toBeCloseTo(30);
    expect(computeShotVelocity(Math.PI, 200).x).toBeCloseTo(-30);
  });

  it('uses snappier billiards physics tuning', () => {
    expect(MAX_SHOT_SPEED).toBe(30);
    expect(BALL_RESTITUTION).toBeGreaterThanOrEqual(0.99);
    expect(RAIL_RESTITUTION).toBeGreaterThan(1);
    expect(BALL_FRICTION_AIR).toBeLessThan(0.018);
  });

  it('sweeps power faster near the low and high ends', () => {
    expect(computeSweepingPower(0)).toBe(10);
    expect(computeSweepingPower(300)).toBe(44);
    expect(computeSweepingPower(600)).toBe(55);
    expect(computeSweepingPower(900)).toBe(66);
    expect(computeSweepingPower(1140)).toBe(91);
    expect(computeSweepingPower(1200)).toBe(100);
    expect(computeSweepingPower(1500)).toBe(66);
    expect(computeSweepingPower(1800)).toBe(55);
    expect(computeSweepingPower(2100)).toBe(44);
    expect(computeSweepingPower(2400)).toBe(10);
  });

  it('adds breathing sway while the player holds aim', () => {
    expect(computeBreathingAimAngle(1, 0, 0)).toBeCloseTo(1);
    expect(computeBreathingAimAngle(1, 450, 0)).toBeCloseTo(1.006);
    expect(computeBreathingAimAngle(1, 450, 5000)).toBeCloseTo(1.034);
  });

  it('computes left and right spin from touch offset beside the aim line', () => {
    const cue = { x: 100, y: 100 };
    expect(computeTouchSpin(cue, { x: 180, y: 100 }, 0)).toBe(0);
    expect(computeTouchSpin(cue, { x: 180, y: 170 }, 0)).toBe(100);
    expect(computeTouchSpin(cue, { x: 180, y: 30 }, 0)).toBe(-100);
  });

  it('computes spin from a dedicated horizontal touch track', () => {
    expect(computeSpinFromTrack(0, 200)).toBe(-100);
    expect(computeSpinFromTrack(100, 200)).toBe(0);
    expect(computeSpinFromTrack(200, 200)).toBe(100);
    expect(computeSpinFromTrack(260, 200)).toBe(100);
    expect(computeSpinFromTrack(-40, 200)).toBe(-100);
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

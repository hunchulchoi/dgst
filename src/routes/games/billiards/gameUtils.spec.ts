import { describe, expect, it } from 'vitest';
import {
  BILLIARDS_MODES,
  ANGULAR_FRICTION_DECAY,
  ANGULAR_STOP_SPEED,
  BALL_FRICTION_AIR,
  BALL_RESTITUTION,
  BALL_STATIC_FRICTION,
  BALL_SURFACE_FRICTION,
  CUE_SPIN_CURVE_SCALE,
  CUE_SPIN_DECAY,
  CUE_SPIN_MIN_SPEED_RATIO,
  CUE_SPIN_STOP_VALUE,
  FOUR_BALL_CHANCES,
  MAX_SHOT_SPEED,
  POCKET_BALL_CHANCES,
  POCKET_RADIUS,
  BALL_RADIUS,
  RAIL_BOUNDARY_DAMPING,
  RAIL_CONTACT_SPIN_DAMPING,
  RAIL_CONTACT_STOP_SPEED,
  RAIL_RESTITUTION,
  RAIL_SURFACE_FRICTION,
  RAIL_TANGENT_DAMPING,
  RAIL_THICKNESS,
  STOP_SNAP_SPEED,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  computeBallCollisionEnergyScale,
  computeBreathingAimAngle,
  computeDynamicSpinCurveScale,
  computeDynamicSpinDecay,
  computeBackspinContactPullScale,
  computeMasseCurveMultiplier,
  computeVerticalSpinFromTrack,
  computeVerticalSpinVelocityScale,
  computeDynamicVelocityScale,
  computePocketClearBonus,
  computePocketShotScore,
  computeRailContactVelocityScale,
  computeRailEnergyScale,
  containBallInTable,
  computeShotVelocity,
  computeSpinFromTrack,
  computeSweepingPower,
  computeTouchSpin,
  evaluateFourBallShot,
  getNextShotSetupStep,
  getPocketCenters,
  isActiveBilliardsMode,
  isBallInPocket,
  isValidScore,
  shouldSnapStoppedSpeed,
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

  it('snaps tiny rolling speeds to prevent endless drift', () => {
    expect(shouldSnapStoppedSpeed(STOP_SNAP_SPEED)).toBe(true);
    expect(shouldSnapStoppedSpeed(STOP_SNAP_SPEED + 0.01)).toBe(false);
  });

  it('keeps fast balls inside the billiards table bounds with cushion damping', () => {
    const leftWall = containBallInTable({
      position: { x: -12, y: 120 },
      velocity: { x: -18, y: 2 }
    });

    expect(leftWall.corrected).toBe(true);
    expect(leftWall.position).toEqual({ x: 28, y: 120 });
    expect(leftWall.velocity.x).toBeCloseTo(18 * RAIL_BOUNDARY_DAMPING);
    expect(leftWall.velocity.y).toBeCloseTo(2 * RAIL_TANGENT_DAMPING);

    const corner = containBallInTable({
      position: { x: 370, y: 570 },
      velocity: { x: 16, y: 14 }
    });

    expect(corner.corrected).toBe(true);
    expect(corner.position).toEqual({ x: 332, y: 532 });
    expect(corner.velocity.x).toBeCloseTo(-16 * RAIL_BOUNDARY_DAMPING * RAIL_TANGENT_DAMPING);
    expect(corner.velocity.y).toBeCloseTo(-14 * RAIL_TANGENT_DAMPING * RAIL_BOUNDARY_DAMPING);
  });

  it('computes shot velocity from independent angle and power controls', () => {
    expect(computeShotVelocity(0, 50).x).toBeCloseTo(9.55);
    expect(computeShotVelocity(0, 50).y).toBeCloseTo(0);
    expect(computeShotVelocity(Math.PI / 2, 100).x).toBeCloseTo(0);
    expect(computeShotVelocity(Math.PI / 2, 100).y).toBeCloseTo(27);
    expect(computeShotVelocity(Math.PI, 200).x).toBeCloseTo(-27);
    expect(computeShotVelocity(0, 25).x).toBeLessThan(4);
  });

  it('uses balanced billiards physics tuning without adding collision energy', () => {
    expect(MAX_SHOT_SPEED).toBe(27);
    expect(BALL_RESTITUTION).toBeLessThanOrEqual(0.94);
    expect(RAIL_RESTITUTION).toBeLessThanOrEqual(0.76);
    expect(BALL_SURFACE_FRICTION).toBeGreaterThan(0);
    expect(BALL_STATIC_FRICTION).toBeGreaterThan(0);
    expect(RAIL_SURFACE_FRICTION).toBeGreaterThan(0);
    expect(RAIL_CONTACT_SPIN_DAMPING).toBeLessThan(0.5);
    expect(BALL_FRICTION_AIR).toBeGreaterThanOrEqual(0.015);
    expect(ANGULAR_FRICTION_DECAY).toBeLessThan(1);
    expect(ANGULAR_STOP_SPEED).toBeGreaterThan(0);
    expect(CUE_SPIN_CURVE_SCALE).toBeLessThan(0.0018);
    expect(CUE_SPIN_DECAY).toBeLessThan(0.995);
    expect(CUE_SPIN_MIN_SPEED_RATIO).toBeGreaterThan(0.3);
    expect(CUE_SPIN_STOP_VALUE).toBeGreaterThan(0);
  });

  it('adapts rolling drag to shot speed and frame time', () => {
    const slowScale = computeDynamicVelocityScale(4, 16.66);
    const fastScale = computeDynamicVelocityScale(24, 16.66);
    const longFrameScale = computeDynamicVelocityScale(24, 32);

    expect(slowScale).toBeGreaterThan(fastScale);
    expect(longFrameScale).toBeLessThan(fastScale);
    expect(fastScale).toBeGreaterThan(0.9);
  });

  it('loses more rail energy on fast cushion hits', () => {
    expect(computeRailEnergyScale(4)).toBeGreaterThan(computeRailEnergyScale(24));
    expect(computeRailEnergyScale(24)).toBeLessThan(0.7);
    expect(computeRailEnergyScale(24)).toBeGreaterThanOrEqual(0.62);
  });

  it('stops slow balls that stay in cushion contact', () => {
    expect(computeRailContactVelocityScale(RAIL_CONTACT_STOP_SPEED)).toBe(0);
    expect(computeRailContactVelocityScale(RAIL_CONTACT_STOP_SPEED + 0.1)).toBeGreaterThan(0);
    expect(computeRailContactVelocityScale(24)).toBeLessThan(computeRailContactVelocityScale(4));
  });

  it('loses more ball collision energy on fast head-on hits than thin hits', () => {
    const thin = computeBallCollisionEnergyScale(20, 0.2);
    const headOn = computeBallCollisionEnergyScale(20, 1);

    expect(thin).toBeGreaterThan(headOn);
    expect(thin).toBeGreaterThan(0.9);
    expect(headOn).toBeLessThan(0.9);
    expect(headOn).toBeGreaterThanOrEqual(0.85);
  });

  it('weakens spin curve and decay as the cue ball slows', () => {
    expect(computeDynamicSpinCurveScale(4)).toBeLessThan(computeDynamicSpinCurveScale(24));
    expect(computeDynamicSpinDecay(4)).toBeLessThan(computeDynamicSpinDecay(24));
  });

  it('boosts curve only for high side spin with vertical spin', () => {
    expect(computeMasseCurveMultiplier(90, 90)).toBeGreaterThan(2);
    expect(computeMasseCurveMultiplier(90, -90)).toBeGreaterThan(2);
    expect(computeMasseCurveMultiplier(90, 0)).toBe(1);
    expect(computeMasseCurveMultiplier(20, 90)).toBe(1);
  });

  it('uses top spin to roll longer and back spin to brake harder', () => {
    const base = computeDynamicVelocityScale(16, 16.66);
    expect(computeVerticalSpinVelocityScale(16, 16.66, 100)).toBeGreaterThan(base);
    expect(computeVerticalSpinVelocityScale(16, 16.66, -100)).toBeLessThan(base);
    expect(computeVerticalSpinVelocityScale(16, 16.66, 0)).toBeCloseTo(base);
    expect(computeBackspinContactPullScale(-100)).toBeGreaterThan(
      computeBackspinContactPullScale(-40)
    );
    expect(computeBackspinContactPullScale(100)).toBe(0);
  });

  it('sweeps power smoothly between the low and high ends', () => {
    expect(computeSweepingPower(0)).toBe(10);
    expect(computeSweepingPower(200)).toBe(23);
    expect(computeSweepingPower(400)).toBe(55);
    expect(computeSweepingPower(600)).toBe(87);
    expect(computeSweepingPower(760)).toBe(99);
    expect(computeSweepingPower(800)).toBe(100);
    expect(computeSweepingPower(1000)).toBe(87);
    expect(computeSweepingPower(1200)).toBe(55);
    expect(computeSweepingPower(1400)).toBe(23);
    expect(computeSweepingPower(1600)).toBe(10);
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

  it('computes top and back spin from a dedicated vertical touch track', () => {
    expect(computeVerticalSpinFromTrack(0, 200)).toBe(100);
    expect(computeVerticalSpinFromTrack(100, 200)).toBe(0);
    expect(computeVerticalSpinFromTrack(200, 200)).toBe(-100);
    expect(computeVerticalSpinFromTrack(260, 200)).toBe(-100);
    expect(computeVerticalSpinFromTrack(-40, 200)).toBe(100);
  });

  it('moves shot setup from angle to spin to power', () => {
    expect(getNextShotSetupStep('angle')).toBe('spin');
    expect(getNextShotSetupStep('spin')).toBe('power');
    expect(getNextShotSetupStep('power')).toBe('power');
  });

  it('accepts active four-ball and pocket-ball submissions', () => {
    expect(BILLIARDS_MODES.FOUR_BALL).toBe('four-ball');
    expect(BILLIARDS_MODES.POCKET_BALL).toBe('pocket-ball');
    expect(FOUR_BALL_CHANCES).toBeGreaterThan(0);
    expect(POCKET_BALL_CHANCES).toBeGreaterThan(FOUR_BALL_CHANCES);
    expect(isActiveBilliardsMode('four-ball')).toBe(true);
    expect(isActiveBilliardsMode('pocket-ball')).toBe(true);
    expect(isActiveBilliardsMode('three-cushion')).toBe(false);
    expect(isActiveBilliardsMode('pool')).toBe(false);
  });

  it('detects balls entering one of six pockets', () => {
    expect(getPocketCenters()).toEqual([
      { x: RAIL_THICKNESS, y: RAIL_THICKNESS },
      { x: TABLE_WIDTH / 2, y: RAIL_THICKNESS },
      { x: TABLE_WIDTH - RAIL_THICKNESS, y: RAIL_THICKNESS },
      { x: RAIL_THICKNESS, y: TABLE_HEIGHT - RAIL_THICKNESS },
      { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT - RAIL_THICKNESS },
      { x: TABLE_WIDTH - RAIL_THICKNESS, y: TABLE_HEIGHT - RAIL_THICKNESS }
    ]);
    expect(isBallInPocket(getPocketCenters()[0])).toBe(true);
    expect(isBallInPocket({ x: RAIL_THICKNESS + BALL_RADIUS, y: RAIL_THICKNESS + BALL_RADIUS })).toBe(true);
    expect(isBallInPocket({ x: 180, y: 280 })).toBe(false);
    expect(isBallInPocket({ x: getPocketCenters()[0].x + POCKET_RADIUS + 1, y: RAIL_THICKNESS })).toBe(false);
  });

  it('scores pocket-ball shots with object, combo, clear bonus, and scratch penalty', () => {
    expect(computePocketShotScore(1, false)).toBe(100);
    expect(computePocketShotScore(2, false)).toBe(250);
    expect(computePocketShotScore(1, true)).toBe(25);
    expect(computePocketShotScore(0, true)).toBe(0);
    expect(computePocketClearBonus(4)).toBe(100);
  });

  it('validates persisted scores as non-negative safe integers', () => {
    expect(isValidScore(0)).toBe(true);
    expect(isValidScore(12)).toBe(true);
    expect(isValidScore(-1)).toBe(false);
    expect(isValidScore(1.5)).toBe(false);
    expect(isValidScore(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  });
});

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
  CORNER_POCKET_MOUTH,
  FOUR_BALL_CHANCES,
  FOUR_BALL_BASE_SCORE,
  FOUR_BALL_FOUL_PENALTY,
  FOUR_BALL_TARGET_SCORE,
  FOUR_BALL_TARGET_OPTIONS,
  LOW_SPEED_TAIL_START,
  MAX_SHOT_SPEED,
  POCKET_BALL_CHANCES,
  POCKET_CAPTURE_RADIUS,
  SIDE_POCKET_MOUTH,
  BALL_RADIUS,
  RAIL_BOUNDARY_DAMPING,
  RAIL_CONTACT_SPIN_DAMPING,
  RAIL_CONTACT_STOP_SPEED,
  RAIL_RESTITUTION,
  RAIL_SURFACE_FRICTION,
  RAIL_TANGENT_DAMPING,
  RAIL_THICKNESS,
  ROLLING_DECELERATION_PER_FRAME,
  STOP_SPEED,
  STOP_SNAP_SPEED,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  computeBallCollisionEnergyScale,
  computeBreathingAimAngle,
  computeFourBallComboMultiplier,
  computeFourBallCutAngles,
  computeFourBallHelpRating,
  computeFourBallFoulPenalty,
  computeFourBallShotScore,
  getFourBallNpcDifficulty,
  computeDynamicSpinCurveScale,
  computeDynamicSpinDecay,
  computeSpinAdjustedVelocity,
  createCueSpinResponse,
  advanceCueSpinResponse,
  computeMasseCurveMultiplier,
  computeVerticalSpinFromTrack,
  computeDynamicVelocityScale,
  computePocketClearBonus,
  computePocketShotScore,
  computeRailContactVelocityScale,
  computeRailEnergyScale,
  computeRailReboundVelocity,
  containBallInTable,
  computeShotVelocity,
  computeSpinFromTrack,
  computeSweepingPower,
  computeTouchSpin,
  evaluateFourBallShot,
  getNextShotSetupStep,
  getPocketCenters,
  getPocketRailGeometry,
  isActiveBilliardsMode,
  isBallInPocket,
  isValidScore,
  shouldSnapStoppedSpeed,
  stopped
} from './gameUtils';

describe('billiards game helpers', () => {
  it('scores a four-ball shot after the cue ball contacts both red balls', () => {
    const result = evaluateFourBallShot([
      { cueRole: 'cue', targetId: 'red-1' },
      { cueRole: 'cue', targetId: 'red-2' }
    ]);

    expect(result.scored).toBe(true);
    expect(result.hitRedIds).toEqual(['red-1', 'red-2']);
  });

  it('does not score a four-ball shot after only one red ball contact', () => {
    const result = evaluateFourBallShot([{ cueRole: 'opponent', targetId: 'red-1' }]);

    expect(result.scored).toBe(false);
    expect(result.hitRedIds).toEqual(['red-1']);
  });

  it('rewards consecutive four-ball scores with a capped half-step combo', () => {
    expect(computeFourBallComboMultiplier(1)).toBe(1);
    expect(computeFourBallComboMultiplier(2)).toBe(1.5);
    expect(computeFourBallComboMultiplier(3)).toBe(2);
    expect(computeFourBallComboMultiplier(5)).toBe(3);
    expect(computeFourBallComboMultiplier(20)).toBe(3);
    expect(computeFourBallShotScore(2)).toBe(FOUR_BALL_BASE_SCORE * 1.5);
    expect(FOUR_BALL_TARGET_SCORE).toBeGreaterThan(computeFourBallShotScore(1));
    expect(Number.isInteger(computeFourBallShotScore(4))).toBe(true);
  });

  it('penalizes missing every red and touching the opponent cue ball', () => {
    expect(computeFourBallFoulPenalty(0, false)).toBe(FOUR_BALL_FOUL_PENALTY);
    expect(computeFourBallFoulPenalty(1, false)).toBe(0);
    expect(computeFourBallFoulPenalty(2, true)).toBe(FOUR_BALL_FOUL_PENALTY);
    expect(computeFourBallFoulPenalty(0, true)).toBe(FOUR_BALL_FOUL_PENALTY * 2);
  });

  it('raises NPC search strength and accuracy for longer matches', () => {
    expect(FOUR_BALL_TARGET_OPTIONS).toEqual([50, 100, 200, 300, 500]);
    const shortMatch = getFourBallNpcDifficulty(50);
    const longMatch = getFourBallNpcDifficulty(500);

    expect(longMatch.candidateBudget).toBeGreaterThan(shortMatch.candidateBudget);
    expect(longMatch.aimError).toBeLessThan(shortMatch.aimError);
  });

  it('samples four-ball cut angles inside the actual target contact cone', () => {
    const shooter = { x: TABLE_WIDTH * 0.42, y: TABLE_HEIGHT * 0.72 };
    const target = { x: TABLE_WIDTH * 0.42, y: TABLE_HEIGHT * 0.28 };
    const angles = computeFourBallCutAngles(shooter, target);
    const baseAngle = -Math.PI / 2;
    const contactHalfAngle = Math.asin(
      (BALL_RADIUS * 2) / Math.hypot(target.x - shooter.x, target.y - shooter.y)
    );

    expect(angles).toHaveLength(11);
    expect(angles).toContain(baseAngle);
    expect(Math.max(...angles) - baseAngle).toBeLessThan(contactHalfAngle);
    expect(baseAngle - Math.min(...angles)).toBeLessThan(contactHalfAngle);
    expect(angles.some((angle) => Math.abs(angle - baseAngle) < 0.02 && angle !== baseAngle)).toBe(
      true
    );
  });

  it('ranks forgiving help shots ahead of fragile or unnecessarily hard shots', () => {
    const fragileMaximumPower = computeFourBallHelpRating(1, 80, 109_000);
    const robustPower64 = computeFourBallHelpRating(4, 64, 108_000);
    const robustPower72 = computeFourBallHelpRating(4, 72, 109_000);

    expect(robustPower64).toBeGreaterThan(fragileMaximumPower);
    expect(robustPower64).toBeGreaterThan(robustPower72);
  });

  it('treats balls as stopped only when every speed is under the threshold', () => {
    expect(stopped([{ speed: 0.01 }, { speed: 0.03 }], 0.05)).toBe(true);
    expect(stopped([{ speed: 0.01 }, { speed: 0.08 }], 0.05)).toBe(false);
  });

  it('snaps tiny rolling speeds to prevent endless drift', () => {
    expect(shouldSnapStoppedSpeed(STOP_SNAP_SPEED)).toBe(true);
    expect(shouldSnapStoppedSpeed(STOP_SNAP_SPEED + 0.01)).toBe(false);
    expect(shouldSnapStoppedSpeed(0.14)).toBe(false);
    expect(STOP_SNAP_SPEED).toBe(STOP_SPEED);
    expect(STOP_SNAP_SPEED).toBeLessThanOrEqual(0.01);
  });

  it('keeps fast balls inside the billiards table bounds with cushion damping', () => {
    const leftWall = containBallInTable({
      position: { x: -12, y: 120 },
      velocity: { x: -18, y: 2 }
    });

    expect(leftWall.corrected).toBe(true);
    expect(leftWall.position).toEqual({ x: RAIL_THICKNESS + BALL_RADIUS, y: 120 });
    expect(leftWall.velocity.x).toBeCloseTo(18 * RAIL_BOUNDARY_DAMPING);
    expect(leftWall.velocity.y).toBeCloseTo(2 * RAIL_TANGENT_DAMPING);

    const corner = containBallInTable({
      position: { x: TABLE_WIDTH + 10, y: TABLE_HEIGHT + 10 },
      velocity: { x: 16, y: 14 }
    });

    expect(corner.corrected).toBe(true);
    expect(corner.position).toEqual({
      x: TABLE_WIDTH - RAIL_THICKNESS - BALL_RADIUS,
      y: TABLE_HEIGHT - RAIL_THICKNESS - BALL_RADIUS
    });
    expect(corner.velocity.x).toBeCloseTo(-16 * RAIL_BOUNDARY_DAMPING * RAIL_TANGENT_DAMPING);
    expect(corner.velocity.y).toBeCloseTo(-14 * RAIL_TANGENT_DAMPING * RAIL_BOUNDARY_DAMPING);

    const alreadyRebounded = containBallInTable({
      position: { x: TABLE_WIDTH - RAIL_THICKNESS - BALL_RADIUS + 0.05, y: 120 },
      velocity: { x: -8.8, y: 2 }
    });

    expect(alreadyRebounded.corrected).toBe(true);
    expect(alreadyRebounded.position).toEqual({
      x: TABLE_WIDTH - RAIL_THICKNESS - BALL_RADIUS,
      y: 120
    });
    expect(alreadyRebounded.velocity).toEqual({ x: -8.8, y: 2 });
  });

  it('computes shot velocity from independent angle and power controls', () => {
    expect(computeShotVelocity(0, 50).x).toBeCloseTo(9.55);
    expect(computeShotVelocity(0, 50).y).toBeCloseTo(0);
    expect(computeShotVelocity(Math.PI / 2, 100).x).toBeCloseTo(0);
    expect(computeShotVelocity(Math.PI / 2, 100).y).toBeCloseTo(27);
    expect(computeShotVelocity(Math.PI, 200).x).toBeCloseTo(-27);
    expect(computeShotVelocity(0, 25).x).toBeLessThan(4);
  });

  it('uses lively billiards physics tuning without adding collision energy', () => {
    expect(MAX_SHOT_SPEED).toBe(27);
    expect(BALL_RESTITUTION).toBeLessThanOrEqual(0.94);
    expect(RAIL_RESTITUTION).toBeLessThanOrEqual(0.88);
    expect(RAIL_RESTITUTION).toBeGreaterThan(0.8);
    expect(BALL_SURFACE_FRICTION).toBeGreaterThan(0);
    expect(BALL_STATIC_FRICTION).toBeGreaterThan(0);
    expect(RAIL_SURFACE_FRICTION).toBeGreaterThan(0);
    expect(RAIL_CONTACT_SPIN_DAMPING).toBeLessThan(0.7);
    expect(BALL_FRICTION_AIR).toBe(0);
    expect(ANGULAR_FRICTION_DECAY).toBeLessThan(1);
    expect(ANGULAR_STOP_SPEED).toBeGreaterThan(0);
    expect(CUE_SPIN_CURVE_SCALE).toBeLessThan(0.0018);
    expect(CUE_SPIN_DECAY).toBeLessThan(0.995);
    expect(CUE_SPIN_MIN_SPEED_RATIO).toBeGreaterThan(0.05);
    expect(CUE_SPIN_MIN_SPEED_RATIO).toBeLessThan(0.25);
    expect(CUE_SPIN_STOP_VALUE).toBeGreaterThan(0);
  });

  it('uses frame-independent near-constant rolling deceleration', () => {
    const slowScale = computeDynamicVelocityScale(4, 16.66);
    const fastScale = computeDynamicVelocityScale(24, 16.66);
    const longFrameScale = computeDynamicVelocityScale(24, 32);
    const slowLoss = 4 * (1 - slowScale);
    const fastLoss = 24 * (1 - fastScale);
    const longFrameLoss = 24 * (1 - longFrameScale);
    const halfFrameScale = computeDynamicVelocityScale(24, 8.33);
    const afterHalfFrame = 24 * halfFrameScale;
    const afterTwoHalfFrames = afterHalfFrame * computeDynamicVelocityScale(afterHalfFrame, 8.33);

    expect(slowLoss).toBeCloseTo(fastLoss, 8);
    expect(longFrameLoss).toBeCloseTo(fastLoss * (32 / 16.66), 8);
    expect(afterTwoHalfFrames).toBeCloseTo(24 * fastScale, 8);
  });

  it('eases only the final low-speed roll without an exponential tail', () => {
    const aboveTailSpeed = LOW_SPEED_TAIL_START + 1;
    const aboveTailNext = aboveTailSpeed * computeDynamicVelocityScale(aboveTailSpeed, 16.66);
    const tailSpeed = LOW_SPEED_TAIL_START / 2;
    const tailNext = tailSpeed * computeDynamicVelocityScale(tailSpeed, 16.66);

    expect(ROLLING_DECELERATION_PER_FRAME).toBeGreaterThanOrEqual(0.04);
    expect(ROLLING_DECELERATION_PER_FRAME).toBeLessThanOrEqual(0.07);
    expect(aboveTailSpeed - aboveTailNext).toBeCloseTo(ROLLING_DECELERATION_PER_FRAME, 8);
    expect(tailSpeed - tailNext).toBeGreaterThan(0);
    expect(tailSpeed - tailNext).toBeLessThan(ROLLING_DECELERATION_PER_FRAME);
  });

  it('integrates rolling deceleration identically across split frame steps', () => {
    const advanceSpeed = (speed: number, deltaMs: number) =>
      speed * computeDynamicVelocityScale(speed, deltaMs);

    for (const speed of [8, LOW_SPEED_TAIL_START, LOW_SPEED_TAIL_START / 2, 0.92]) {
      const fullStep = advanceSpeed(speed, 16.66);
      const halfStep = advanceSpeed(speed, 8.33);
      const splitStep = advanceSpeed(halfStep, 8.33);
      expect(splitStep).toBeCloseTo(fullStep, 10);
    }
  });

  it('loses more rail energy on fast cushion hits', () => {
    expect(computeRailEnergyScale(4)).toBeGreaterThan(computeRailEnergyScale(24));
    expect(computeRailEnergyScale(24)).toBeLessThan(0.84);
    expect(computeRailEnergyScale(24)).toBeGreaterThanOrEqual(0.8);
  });

  it('only stops near-dead balls that stay in cushion contact', () => {
    expect(computeRailContactVelocityScale(RAIL_CONTACT_STOP_SPEED)).toBe(0);
    expect(computeRailContactVelocityScale(RAIL_CONTACT_STOP_SPEED + 0.1)).toBeGreaterThan(0);
    expect(computeRailContactVelocityScale(24)).toBeLessThan(computeRailContactVelocityScale(4));
    expect(computeRailContactVelocityScale(24)).toBeGreaterThan(0.9);
  });

  it('loses more ball collision energy on fast head-on hits than thin hits', () => {
    const thin = computeBallCollisionEnergyScale(20, 0.2);
    const headOn = computeBallCollisionEnergyScale(20, 1);

    expect(thin).toBeGreaterThan(headOn);
    expect(thin).toBeGreaterThan(0.9);
    expect(headOn).toBeLessThan(0.9);
    expect(headOn).toBeGreaterThanOrEqual(0.85);
  });

  it('weakens spin curve smoothly as the cue ball slows', () => {
    expect(computeDynamicSpinCurveScale(0)).toBe(0);
    expect(computeDynamicSpinCurveScale(4)).toBeLessThan(computeDynamicSpinCurveScale(24));
    expect(computeDynamicSpinDecay(4)).toBeLessThan(computeDynamicSpinDecay(24));
  });

  it('keeps spin decay consistent across different frame rates', () => {
    const oneFrame = computeDynamicSpinDecay(18, 16.66);
    const twoHalfFrames = computeDynamicSpinDecay(18, 8.33) ** 2;

    expect(twoHalfFrames).toBeCloseTo(oneFrame, 6);
  });

  it('keeps ordinary side spin straight on the cloth', () => {
    const straight = { x: 20, y: 0 };
    const right = computeSpinAdjustedVelocity(straight, 100, 0, 16.66);
    const left = computeSpinAdjustedVelocity(straight, -100, 0, 16.66);

    expect(right).toEqual(straight);
    expect(left).toEqual(straight);
    expect(computeSpinAdjustedVelocity(straight, 0, 100, 16.66)).toEqual(straight);
  });

  it('curves only for a high side-and-vertical-spin masse shot', () => {
    expect(computeMasseCurveMultiplier(90, 90)).toBeGreaterThan(0);
    expect(computeMasseCurveMultiplier(90, 90)).toBeLessThan(1);
    expect(computeMasseCurveMultiplier(90, -90)).toBeGreaterThan(0);
    expect(computeMasseCurveMultiplier(90, 0)).toBe(0);
    expect(computeMasseCurveMultiplier(20, 90)).toBe(0);

    const right = computeSpinAdjustedVelocity({ x: 20, y: 0 }, 90, 90, 16.66);
    const left = computeSpinAdjustedVelocity({ x: 20, y: 0 }, -90, 90, 16.66);
    expect(right.y).toBeGreaterThan(0);
    expect(left.y).toBeCloseTo(-right.y, 6);
    expect(Math.hypot(right.x, right.y)).toBeCloseTo(20, 6);
  });

  it('turns top spin into follow and back spin into draw after contact', () => {
    const incomingCue = { x: 18, y: 0 };
    const stoppedTarget = { x: 0, y: 0 };
    const follow = createCueSpinResponse(incomingCue, stoppedTarget, { x: 1, y: 0 }, 100);
    const draw = createCueSpinResponse(incomingCue, stoppedTarget, { x: 1, y: 0 }, -100);

    expect(createCueSpinResponse(incomingCue, stoppedTarget, { x: 1, y: 0 }, 0)).toBeNull();
    expect(follow).not.toBeNull();
    expect(draw).not.toBeNull();
    const followed = advanceCueSpinResponse({ x: 0.5, y: 0 }, follow!, 140);
    const drawn = advanceCueSpinResponse({ x: 0.5, y: 0 }, draw!, 140);
    expect(followed.velocity.x).toBeGreaterThan(0.5);
    expect(drawn.velocity.x).toBeLessThan(0);

    let splitVelocity = { x: 0.5, y: 0 };
    let splitResponse = follow;
    for (let index = 0; index < 14 && splitResponse; index += 1) {
      const next = advanceCueSpinResponse(splitVelocity, splitResponse, 10);
      splitVelocity = next.velocity;
      splitResponse = next.response;
    }
    expect(splitVelocity.x).toBeCloseTo(followed.velocity.x, 8);
  });

  it('transfers side spin into the cushion angle symmetrically', () => {
    const base = computeRailReboundVelocity({ x: -9.4, y: 0 }, 'right');
    const rightEnglish = computeRailReboundVelocity({ x: -9.4, y: 0 }, 'right', undefined, 100);
    const leftEnglish = computeRailReboundVelocity({ x: -9.4, y: 0 }, 'right', undefined, -100);
    const flippedNormal = computeRailReboundVelocity(
      { x: -9.4, y: 0 },
      'right',
      { x: 1, y: 0 },
      100
    );

    expect(base.y).toBe(0);
    expect(rightEnglish.y).toBeGreaterThan(0);
    expect(leftEnglish.y).toBeCloseTo(-rightEnglish.y, 8);
    expect(flippedNormal).toEqual(rightEnglish);
  });

  it('kicks right English in the physical direction on all four cushions', () => {
    const top = computeRailReboundVelocity({ x: 0, y: 9.4 }, 'top', undefined, 100);
    const right = computeRailReboundVelocity({ x: -9.4, y: 0 }, 'right', undefined, 100);
    const bottom = computeRailReboundVelocity({ x: 0, y: -9.4 }, 'bottom', undefined, 100);
    const left = computeRailReboundVelocity({ x: 9.4, y: 0 }, 'left', undefined, 100);

    expect(top.x).toBeGreaterThan(0);
    expect(right.y).toBeGreaterThan(0);
    expect(bottom.x).toBeLessThan(0);
    expect(left.y).toBeLessThan(0);
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
      { x: TABLE_WIDTH - RAIL_THICKNESS, y: RAIL_THICKNESS },
      { x: RAIL_THICKNESS, y: TABLE_HEIGHT / 2 },
      { x: TABLE_WIDTH - RAIL_THICKNESS, y: TABLE_HEIGHT / 2 },
      { x: RAIL_THICKNESS, y: TABLE_HEIGHT - RAIL_THICKNESS },
      { x: TABLE_WIDTH - RAIL_THICKNESS, y: TABLE_HEIGHT - RAIL_THICKNESS }
    ]);
    expect(isBallInPocket(getPocketCenters()[0])).toBe(true);
    expect(
      isBallInPocket({ x: RAIL_THICKNESS + BALL_RADIUS, y: RAIL_THICKNESS + BALL_RADIUS })
    ).toBe(true);
    expect(isBallInPocket({ x: RAIL_THICKNESS + BALL_RADIUS, y: TABLE_HEIGHT / 2 })).toBe(true);
    expect(isBallInPocket({ x: TABLE_WIDTH / 2, y: TABLE_HEIGHT / 2 })).toBe(false);
    expect(
      isBallInPocket({
        x: getPocketCenters()[0].x + POCKET_CAPTURE_RADIUS + 1,
        y: RAIL_THICKNESS
      })
    ).toBe(false);
  });

  it('uses a regulation-scale 1:2 playfield with tight jaw geometry', () => {
    const playableWidth = TABLE_WIDTH - RAIL_THICKNESS * 2;
    const playableHeight = TABLE_HEIGHT - RAIL_THICKNESS * 2;
    const geometry = getPocketRailGeometry();

    expect(playableHeight / playableWidth).toBe(2);
    expect((BALL_RADIUS * 2) / playableWidth).toBeGreaterThan(0.043);
    expect((BALL_RADIUS * 2) / playableWidth).toBeLessThan(0.046);
    expect(CORNER_POCKET_MOUTH / (BALL_RADIUS * 2)).toBe(2);
    expect(SIDE_POCKET_MOUTH / (BALL_RADIUS * 2)).toBeCloseTo(2.2);
    expect(geometry.rails).toHaveLength(6);
    expect(geometry.jaws).toHaveLength(12);
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

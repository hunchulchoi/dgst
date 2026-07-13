export const BILLIARDS_MODES = {
  FOUR_BALL: 'four-ball',
  POCKET_BALL: 'pocket-ball',
  THREE_CUSHION: 'three-cushion'
} as const;

export type BilliardsMode = (typeof BILLIARDS_MODES)[keyof typeof BILLIARDS_MODES];
export type ActiveBilliardsMode =
  | typeof BILLIARDS_MODES.FOUR_BALL
  | typeof BILLIARDS_MODES.POCKET_BALL;
export type BallRole = 'cue' | 'red' | 'opponent';
export type ShotSetupStep = 'angle' | 'spin' | 'power';

export interface ShotContact {
  cueRole: BallRole;
  targetId: string;
}

export interface SpeedSample {
  speed: number;
}

export interface BallBoundarySample {
  position: { x: number; y: number };
  velocity: { x: number; y: number };
}

export const TABLE_WIDTH = 360;
export const TABLE_HEIGHT = 560;
export const BALL_RADIUS = 10;
export const RAIL_THICKNESS = 18;
export const POCKET_RADIUS = 18;
export const MAX_SHOT_SPEED = 27;
export const STOP_SPEED = 0.06;
export const STOP_SNAP_SPEED = 0.14;
export const MAX_ROLL_DURATION_MS = 12000;
export const FOUR_BALL_CHANCES = 10;
export const FOUR_BALL_BASE_SCORE = 10;
export const FOUR_BALL_TARGET_SCORE = 100;
export const FOUR_BALL_TARGET_OPTIONS = [50, 100, 200, 300, 500] as const;
export type FourBallTargetScore = (typeof FOUR_BALL_TARGET_OPTIONS)[number];
export const FOUR_BALL_MAX_COMBO_MULTIPLIER = 3;
export const FOUR_BALL_FOUL_PENALTY = 10;
export const POCKET_BALL_CHANCES = 12;
export const POCKET_OBJECT_SCORE = 100;
export const POCKET_COMBO_BONUS = 50;
export const POCKET_CLEAR_BONUS_PER_CHANCE = 25;
export const POCKET_CUE_SCRATCH_PENALTY = 75;
export const BALL_RESTITUTION = 0.94;
export const BALL_SURFACE_FRICTION = 0.018;
export const BALL_STATIC_FRICTION = 0.006;
export const BALL_FRICTION_AIR = 0.015;
export const RAIL_RESTITUTION = 0.88;
export const RAIL_SURFACE_FRICTION = 0.016;
export const RAIL_BOUNDARY_DAMPING = 0.86;
export const RAIL_TANGENT_DAMPING = 0.96;
export const RAIL_CONTACT_STOP_SPEED = 0.35;
export const RAIL_CONTACT_SPIN_DAMPING = 0.62;
export const CUE_SPIN_ANGULAR_SCALE = 380;
export const CUE_SPIN_CURVE_SCALE = 0.00016;
export const CUE_SPIN_DECAY = 0.992;
export const CUE_SPIN_MIN_SPEED_RATIO = 0.14;
export const CUE_SPIN_STOP_VALUE = 2;
export const CUE_VERTICAL_SPIN_DRAG_REDUCTION = 0.55;
export const CUE_VERTICAL_SPIN_BRAKE_BOOST = 1.25;
export const CUE_MASSE_MIN_SIDE_SPIN = 55;
export const CUE_MASSE_MIN_VERTICAL_SPIN = 35;
export const CUE_MASSE_CURVE_BOOST = 0.55;
export const CUE_BACKSPIN_CONTACT_PULL = 0.32;
export const ANGULAR_FRICTION_DECAY = 0.94;
export const ANGULAR_STOP_SPEED = 0.018;
export const DYNAMIC_DRAG_BASE = 0.0018;
export const DYNAMIC_DRAG_SPEED_SCALE = 0.0048;
export const POWER_SWEEP_MIN = 10;
export const POWER_SWEEP_MAX = 100;
export const POWER_SWEEP_PERIOD_MS = 1600;
export const POWER_RESPONSE_EXPONENT = 1.5;
export const AIM_BREATH_PERIOD_MS = 1800;
export const AIM_BREATH_BASE_SWAY = 0.006;
export const AIM_BREATH_EXTRA_SWAY = 0.028;
export const SPIN_TOUCH_RANGE = 70;

export function isActiveBilliardsMode(value: unknown): value is ActiveBilliardsMode {
  return value === BILLIARDS_MODES.FOUR_BALL || value === BILLIARDS_MODES.POCKET_BALL;
}

export function isValidScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function stopped(samples: SpeedSample[], threshold = STOP_SPEED): boolean {
  return samples.every((sample) => sample.speed < threshold);
}

export function shouldSnapStoppedSpeed(speed: number): boolean {
  return speed <= STOP_SNAP_SPEED;
}

export function containBallInTable(sample: BallBoundarySample): {
  corrected: boolean;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
} {
  const minX = RAIL_THICKNESS + BALL_RADIUS;
  const maxX = TABLE_WIDTH - RAIL_THICKNESS - BALL_RADIUS;
  const minY = RAIL_THICKNESS + BALL_RADIUS;
  const maxY = TABLE_HEIGHT - RAIL_THICKNESS - BALL_RADIUS;
  const position = { ...sample.position };
  const velocity = { ...sample.velocity };
  let corrected = false;

  if (position.x < minX) {
    position.x = minX;
    velocity.x = Math.abs(velocity.x) * RAIL_BOUNDARY_DAMPING;
    velocity.y *= RAIL_TANGENT_DAMPING;
    corrected = true;
  } else if (position.x > maxX) {
    position.x = maxX;
    velocity.x = -Math.abs(velocity.x) * RAIL_BOUNDARY_DAMPING;
    velocity.y *= RAIL_TANGENT_DAMPING;
    corrected = true;
  }

  if (position.y < minY) {
    position.y = minY;
    velocity.y = Math.abs(velocity.y) * RAIL_BOUNDARY_DAMPING;
    velocity.x *= RAIL_TANGENT_DAMPING;
    corrected = true;
  } else if (position.y > maxY) {
    position.y = maxY;
    velocity.y = -Math.abs(velocity.y) * RAIL_BOUNDARY_DAMPING;
    velocity.x *= RAIL_TANGENT_DAMPING;
    corrected = true;
  }

  return { corrected, position, velocity };
}

export function getPocketCenters(): Array<{ x: number; y: number }> {
  const minX = RAIL_THICKNESS;
  const maxX = TABLE_WIDTH - RAIL_THICKNESS;
  const minY = RAIL_THICKNESS;
  const midY = TABLE_HEIGHT / 2;
  const maxY = TABLE_HEIGHT - RAIL_THICKNESS;
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: minX, y: midY },
    { x: maxX, y: midY },
    { x: minX, y: maxY },
    { x: maxX, y: maxY }
  ];
}

export function isBallInPocket(
  position: { x: number; y: number },
  pocketRadius = POCKET_RADIUS
): boolean {
  return getPocketCenters().some(
    (pocket) => Math.hypot(position.x - pocket.x, position.y - pocket.y) <= pocketRadius
  );
}

export function computePocketShotScore(pocketedObjects: number, cueScratched: boolean): number {
  const objectScore = Math.max(0, pocketedObjects) * POCKET_OBJECT_SCORE;
  const comboBonus = Math.max(0, pocketedObjects - 1) * POCKET_COMBO_BONUS;
  const scratchPenalty = cueScratched ? POCKET_CUE_SCRATCH_PENALTY : 0;
  return Math.max(0, objectScore + comboBonus - scratchPenalty);
}

export function computePocketClearBonus(remainingChances: number): number {
  return Math.max(0, remainingChances) * POCKET_CLEAR_BONUS_PER_CHANCE;
}

export function computeShotVelocity(angle: number, powerPercent: number): { x: number; y: number } {
  const clampedPower = Math.min(100, Math.max(0, powerPercent));
  const speed = (clampedPower / 100) ** POWER_RESPONSE_EXPONENT * MAX_SHOT_SPEED;
  return {
    x: Math.cos(angle) * speed,
    y: Math.sin(angle) * speed
  };
}

export function computeSpeedRatio(speed: number): number {
  return Math.max(0, Math.min(1, speed / MAX_SHOT_SPEED));
}

export function computeDynamicVelocityScale(speed: number, deltaMs: number): number {
  const frameScale = Math.max(0, deltaMs / 16.66);
  const loss =
    (DYNAMIC_DRAG_BASE + DYNAMIC_DRAG_SPEED_SCALE * computeSpeedRatio(speed)) * frameScale;
  return Math.max(0.9, 1 - loss);
}

export function computeRailEnergyScale(speed: number): number {
  return 0.94 - 0.12 * computeSpeedRatio(speed);
}

export function computeRailContactVelocityScale(speed: number): number {
  if (speed <= RAIL_CONTACT_STOP_SPEED) return 0;
  return 0.98 - 0.08 * computeSpeedRatio(speed);
}

export function computeBallCollisionEnergyScale(
  relativeSpeed: number,
  headOnRatio: number
): number {
  const normalizedHeadOn = Math.max(0, Math.min(1, headOnRatio));
  const speedRatio = computeSpeedRatio(relativeSpeed);
  const loss = 0.018 + 0.09 * speedRatio * normalizedHeadOn + 0.045 * speedRatio ** 2;
  return Math.max(0.85, 1 - loss);
}

export function computeDynamicSpinCurveScale(speed: number): number {
  const ratio = computeSpeedRatio(speed);
  const rollingRatio = Math.max(
    0,
    Math.min(1, (ratio - CUE_SPIN_MIN_SPEED_RATIO) / (1 - CUE_SPIN_MIN_SPEED_RATIO))
  );
  const smoothRatio = rollingRatio * rollingRatio * (3 - 2 * rollingRatio);
  return CUE_SPIN_CURVE_SCALE * smoothRatio;
}

export function computeMasseCurveMultiplier(sideSpin: number, verticalSpin: number): number {
  const sideRatio = Math.max(0, Math.min(1, Math.abs(sideSpin) / 100));
  const verticalRatio = Math.max(0, Math.min(1, Math.abs(verticalSpin) / 100));
  if (
    Math.abs(sideSpin) < CUE_MASSE_MIN_SIDE_SPIN ||
    Math.abs(verticalSpin) < CUE_MASSE_MIN_VERTICAL_SPIN
  ) {
    return 1;
  }
  return 1 + CUE_MASSE_CURVE_BOOST * sideRatio * verticalRatio;
}

export function computeDynamicSpinDecay(speed: number, deltaMs = 16.66): number {
  const perFrameRetention = CUE_SPIN_DECAY - 0.004 * (1 - computeSpeedRatio(speed));
  return perFrameRetention ** Math.max(0, deltaMs / 16.66);
}

export function computeSpinAdjustedVelocity(
  velocity: { x: number; y: number },
  sideSpin: number,
  verticalSpin: number,
  deltaMs: number
): { x: number; y: number } {
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed <= STOP_SPEED || sideSpin === 0) return { ...velocity };

  const curveScale = computeDynamicSpinCurveScale(speed);
  if (curveScale === 0) return { ...velocity };

  const turn =
    (Math.max(-100, Math.min(100, sideSpin)) / 100) *
    curveScale *
    computeMasseCurveMultiplier(sideSpin, verticalSpin) *
    Math.max(0, deltaMs);
  const tangent = { x: -velocity.y / speed, y: velocity.x / speed };
  const curved = {
    x: velocity.x + tangent.x * speed * turn,
    y: velocity.y + tangent.y * speed * turn
  };
  const curvedSpeed = Math.hypot(curved.x, curved.y);
  if (curvedSpeed === 0) return { ...velocity };
  const preserveSpeed = speed / curvedSpeed;
  return { x: curved.x * preserveSpeed, y: curved.y * preserveSpeed };
}

export function computeVerticalSpinVelocityScale(
  speed: number,
  deltaMs: number,
  verticalSpin: number
): number {
  const baseScale = computeDynamicVelocityScale(speed, deltaMs);
  const baseLoss = 1 - baseScale;
  const normalizedSpin = Math.max(-1, Math.min(1, verticalSpin / 100));
  const lossScale =
    normalizedSpin >= 0
      ? 1 - CUE_VERTICAL_SPIN_DRAG_REDUCTION * normalizedSpin
      : 1 + CUE_VERTICAL_SPIN_BRAKE_BOOST * Math.abs(normalizedSpin);
  return Math.max(0.9, 1 - baseLoss * lossScale);
}

export function computeBackspinContactPullScale(verticalSpin: number): number {
  return CUE_BACKSPIN_CONTACT_PULL * Math.max(0, Math.min(1, -verticalSpin / 100));
}

export function computeSweepingPower(timeMs: number): number {
  const wrapped =
    ((timeMs % POWER_SWEEP_PERIOD_MS) + POWER_SWEEP_PERIOD_MS) % POWER_SWEEP_PERIOD_MS;
  const progress = (1 - Math.cos((wrapped / POWER_SWEEP_PERIOD_MS) * Math.PI * 2)) / 2;
  return Math.round(POWER_SWEEP_MIN + (POWER_SWEEP_MAX - POWER_SWEEP_MIN) * progress);
}

export function computeBreathingAimAngle(
  baseAngle: number,
  elapsedMs: number,
  holdMs: number
): number {
  const holdFactor = Math.min(1, Math.max(0, holdMs / 5000));
  const amplitude = AIM_BREATH_BASE_SWAY + AIM_BREATH_EXTRA_SWAY * holdFactor;
  const phase = (elapsedMs / AIM_BREATH_PERIOD_MS) * Math.PI * 2;
  return baseAngle + Math.sin(phase) * amplitude;
}

export function computeTouchSpin(
  cue: { x: number; y: number },
  touch: { x: number; y: number },
  aimAngle: number
): number {
  const dx = touch.x - cue.x;
  const dy = touch.y - cue.y;
  const perpendicular = -Math.sin(aimAngle) * dx + Math.cos(aimAngle) * dy;
  const normalized = Math.max(-1, Math.min(1, perpendicular / SPIN_TOUCH_RANGE));
  return Math.round(normalized * 100);
}

export function computeSpinFromTrack(offsetX: number, width: number): number {
  if (width <= 0) return 0;
  const normalized = Math.max(-1, Math.min(1, (offsetX / width) * 2 - 1));
  return Math.round(normalized * 100);
}

export function computeVerticalSpinFromTrack(offsetY: number, height: number): number {
  if (height <= 0) return 0;
  const normalized = Math.max(-1, Math.min(1, 1 - (offsetY / height) * 2));
  return Math.round(normalized * 100);
}

export function getNextShotSetupStep(step: ShotSetupStep): ShotSetupStep {
  if (step === 'angle') return 'spin';
  if (step === 'spin') return 'power';
  return 'power';
}

export function evaluateFourBallShot(contacts: ShotContact[]): {
  scored: boolean;
  hitRedIds: string[];
} {
  const hitRedIds = Array.from(
    new Set(contacts.map((contact) => contact.targetId))
  );

  return {
    scored: hitRedIds.length >= 2,
    hitRedIds
  };
}

export function computeFourBallComboMultiplier(streak: number): number {
  const normalizedStreak = Math.max(1, Math.floor(streak));
  return Math.min(
    FOUR_BALL_MAX_COMBO_MULTIPLIER,
    1 + (normalizedStreak - 1) * 0.5
  );
}

export function computeFourBallShotScore(streak: number): number {
  return FOUR_BALL_BASE_SCORE * computeFourBallComboMultiplier(streak);
}

export function computeFourBallFoulPenalty(
  hitRedCount: number,
  hitOpponentCue: boolean
): number {
  return (hitRedCount <= 0 ? FOUR_BALL_FOUL_PENALTY : 0) +
    (hitOpponentCue ? FOUR_BALL_FOUL_PENALTY : 0);
}

export function getFourBallNpcDifficulty(targetScore: FourBallTargetScore): {
  candidateBudget: number;
  aimError: number;
} {
  if (targetScore >= 500) return { candidateBudget: 84, aimError: 0.008 };
  if (targetScore >= 300) return { candidateBudget: 68, aimError: 0.014 };
  if (targetScore >= 200) return { candidateBudget: 52, aimError: 0.022 };
  if (targetScore >= 100) return { candidateBudget: 36, aimError: 0.035 };
  return { candidateBudget: 22, aimError: 0.055 };
}

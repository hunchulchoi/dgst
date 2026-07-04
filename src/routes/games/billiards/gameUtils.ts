export const BILLIARDS_MODES = {
  FOUR_BALL: 'four-ball',
  THREE_CUSHION: 'three-cushion'
} as const;

export type BilliardsMode = (typeof BILLIARDS_MODES)[keyof typeof BILLIARDS_MODES];
export type ActiveBilliardsMode = typeof BILLIARDS_MODES.FOUR_BALL;
export type BallRole = 'cue' | 'red' | 'opponent';

export interface ShotContact {
  cueRole: BallRole;
  targetId: string;
}

export interface SpeedSample {
  speed: number;
}

export const TABLE_WIDTH = 360;
export const TABLE_HEIGHT = 560;
export const BALL_RADIUS = 10;
export const RAIL_THICKNESS = 18;
export const MAX_SHOT_SPEED = 20;
export const STOP_SPEED = 0.08;
export const FOUR_BALL_CHANCES = 10;
export const POWER_SWEEP_MIN = 10;
export const POWER_SWEEP_MAX = 100;
export const POWER_SWEEP_PERIOD_MS = 2400;
export const AIM_BREATH_PERIOD_MS = 1800;
export const AIM_BREATH_BASE_SWAY = 0.006;
export const AIM_BREATH_EXTRA_SWAY = 0.028;
export const SPIN_TOUCH_RANGE = 70;

export function isActiveBilliardsMode(value: unknown): value is ActiveBilliardsMode {
  return value === BILLIARDS_MODES.FOUR_BALL;
}

export function isValidScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function stopped(samples: SpeedSample[], threshold = STOP_SPEED): boolean {
  return samples.every((sample) => sample.speed < threshold);
}

export function computeShotVelocity(angle: number, powerPercent: number): { x: number; y: number } {
  const clampedPower = Math.min(100, Math.max(0, powerPercent));
  const speed = (clampedPower / 100) * MAX_SHOT_SPEED;
  return {
    x: Math.cos(angle) * speed,
    y: Math.sin(angle) * speed
  };
}

export function computeSweepingPower(timeMs: number): number {
  const halfPeriod = POWER_SWEEP_PERIOD_MS / 2;
  const wrapped =
    ((timeMs % POWER_SWEEP_PERIOD_MS) + POWER_SWEEP_PERIOD_MS) % POWER_SWEEP_PERIOD_MS;
  const progress =
    wrapped <= halfPeriod ? wrapped / halfPeriod : 1 - (wrapped - halfPeriod) / halfPeriod;
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

export function evaluateFourBallShot(contacts: ShotContact[]): {
  scored: boolean;
  hitRedIds: string[];
} {
  const hitRedIds = Array.from(
    new Set(
      contacts.filter((contact) => contact.cueRole === 'red').map((contact) => contact.targetId)
    )
  );

  return {
    scored: hitRedIds.length >= 2,
    hitRedIds
  };
}

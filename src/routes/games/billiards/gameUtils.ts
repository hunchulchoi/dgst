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
export const MAX_SHOT_SPEED = 7.5;
export const STOP_SPEED = 0.08;
export const FOUR_BALL_CHANCES = 10;

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

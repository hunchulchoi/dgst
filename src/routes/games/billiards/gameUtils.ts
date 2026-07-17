export const BILLIARDS_MODES = {
  FOUR_BALL: 'four-ball',
  POCKET_BALL: 'pocket-ball',
  ART_PUZZLE: 'art-puzzle',
  THREE_CUSHION: 'three-cushion'
} as const;

export type BilliardsMode = (typeof BILLIARDS_MODES)[keyof typeof BILLIARDS_MODES];
export type ActiveBilliardsMode =
  | typeof BILLIARDS_MODES.FOUR_BALL
  | typeof BILLIARDS_MODES.POCKET_BALL;
export type BilliardsRankingMode = ActiveBilliardsMode | typeof BILLIARDS_MODES.ART_PUZZLE;
export type BallRole = 'cue' | 'red' | 'opponent';
export type ShotSetupStep = 'angle' | 'spin' | 'power';
export type BilliardsRailSide = 'top' | 'right' | 'bottom' | 'left';

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

export interface BallMotionSample {
  velocity: { x: number; y: number };
}

export type PocketRailRectangle = {
  x: number;
  y: number;
  width: number;
  height: number;
  side: BilliardsRailSide;
};

export type PocketJawGeometry = {
  vertices: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
  face: [{ x: number; y: number }, { x: number; y: number }];
  side: BilliardsRailSide;
};

export type CueSpinResponse = {
  direction: { x: number; y: number };
  remainingDeltaSpeed: number;
  remainingMs: number;
};

export const TABLE_WIDTH = 360;
export const TABLE_HEIGHT = 684;
export const BALL_RADIUS = 7.2;
export const RAIL_THICKNESS = 18;
export const POCKET_CAPTURE_RADIUS = BALL_RADIUS * 1.55;
export const POCKET_DRAW_RADIUS = 12;
export const CORNER_POCKET_MOUTH = BALL_RADIUS * 4;
export const SIDE_POCKET_MOUTH = BALL_RADIUS * 4.4;
export const POCKET_MOUTH_CAPTURE_TOLERANCE = 0.35;
export const MAX_SHOT_SPEED = 27;
export const PHYSICS_BASE_STEP_MS = 16.66;
export const PHYSICS_MAX_TRAVEL_PER_STEP = BALL_RADIUS * 0.2;
export const PHYSICS_MAX_SUBSTEPS = 48;
export const PHYSICS_MAX_CATCH_UP_MS = PHYSICS_BASE_STEP_MS * 4;
export const PHYSICS_SLICE_TOLERANCE_MS = 0.01;
export const STOP_SPEED = 0.008;
export const STOP_SNAP_SPEED = STOP_SPEED;
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
export const BALL_FRICTION_AIR = 0;
export const RAIL_RESTITUTION = 0.88;
export const RAIL_SURFACE_FRICTION = 0.016;
export const RAIL_BOUNDARY_DAMPING = 0.86;
export const RAIL_TANGENT_DAMPING = 0.96;
export const RAIL_CONTACT_STOP_SPEED = 0.35;
export const RAIL_CONTACT_SPIN_DAMPING = 0.62;
export const CUE_SIDE_SPIN_RAIL_COUPLING = 0.14;
export const CUE_SPIN_ANGULAR_SCALE = 380;
export const CUE_SPIN_CURVE_SCALE = 0.00016;
export const CUE_SPIN_DECAY = 0.992;
export const CUE_SPIN_MIN_SPEED_RATIO = 0.14;
export const CUE_SPIN_STOP_VALUE = 2;
export const CUE_MASSE_MIN_SIDE_SPIN = 55;
export const CUE_MASSE_MIN_VERTICAL_SPIN = 35;
export const CUE_MASSE_CURVE_BOOST = 0.55;
export const CUE_FOLLOW_CONTACT_PUSH = 0.22;
export const CUE_BACKSPIN_CONTACT_PULL = 0.32;
export const CUE_VERTICAL_SPIN_RESPONSE_MS = 140;
export const CUE_VERTICAL_SPIN_CONTACT_RETENTION = 0.35;
export const ANGULAR_FRICTION_DECAY = 0.94;
export const ANGULAR_STOP_SPEED = 0.018;
export const ROLLING_DECELERATION_PER_FRAME = 0.055;
export const LOW_SPEED_TAIL_START = 0.9;
export const POWER_SWEEP_MIN = 10;
export const POWER_SWEEP_MAX = 100;
export const POWER_SWEEP_PERIOD_MS = 1600;
export const POWER_RESPONSE_EXPONENT = 1.5;
export const AIM_BREATH_PERIOD_MS = 1800;
export const AIM_BREATH_BASE_SWAY = 0.006;
export const AIM_BREATH_EXTRA_SWAY = 0.028;
export const SPIN_TOUCH_RANGE = 70;
export const FOUR_BALL_CUT_FACTORS = [
  -0.9, -0.7, -0.5, -0.35, -0.2, 0, 0.2, 0.35, 0.5, 0.7, 0.9
] as const;

export function isActiveBilliardsMode(value: unknown): value is ActiveBilliardsMode {
  return value === BILLIARDS_MODES.FOUR_BALL || value === BILLIARDS_MODES.POCKET_BALL;
}

export function isBilliardsRankingMode(value: unknown): value is BilliardsRankingMode {
  return isActiveBilliardsMode(value) || value === BILLIARDS_MODES.ART_PUZZLE;
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
    if (velocity.x < 0) {
      velocity.x = Math.abs(velocity.x) * RAIL_BOUNDARY_DAMPING;
      velocity.y *= RAIL_TANGENT_DAMPING;
    }
    corrected = true;
  } else if (position.x > maxX) {
    position.x = maxX;
    if (velocity.x > 0) {
      velocity.x = -Math.abs(velocity.x) * RAIL_BOUNDARY_DAMPING;
      velocity.y *= RAIL_TANGENT_DAMPING;
    }
    corrected = true;
  }

  if (position.y < minY) {
    position.y = minY;
    if (velocity.y < 0) {
      velocity.y = Math.abs(velocity.y) * RAIL_BOUNDARY_DAMPING;
      velocity.x *= RAIL_TANGENT_DAMPING;
    }
    corrected = true;
  } else if (position.y > maxY) {
    position.y = maxY;
    if (velocity.y > 0) {
      velocity.y = -Math.abs(velocity.y) * RAIL_BOUNDARY_DAMPING;
      velocity.x *= RAIL_TANGENT_DAMPING;
    }
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
  pocketRadius = POCKET_CAPTURE_RADIUS
): boolean {
  const centers = getPocketCenters();
  return centers.some((pocket, index) => {
    const dx = position.x - pocket.x;
    const dy = position.y - pocket.y;
    if (Math.hypot(dx, dy) > pocketRadius) return false;

    const isSidePocket = index === 2 || index === 3;
    if (isSidePocket) {
      const centerClearance = SIDE_POCKET_MOUTH / 2 - BALL_RADIUS + POCKET_MOUTH_CAPTURE_TOLERANCE;
      return Math.abs(dy) <= centerClearance;
    }

    const inwardX = dx * (index === 0 || index === 2 || index === 4 ? 1 : -1);
    const inwardY = dy * (index <= 1 ? 1 : -1);
    const tangentOffset = Math.abs((inwardX - inwardY) / Math.SQRT2);
    const centerClearance =
      (CORNER_POCKET_MOUTH - BALL_RADIUS * 2) / 2 + POCKET_MOUTH_CAPTURE_TOLERANCE;
    return tangentOffset <= centerClearance;
  });
}

function isPositionInPocketMouth(
  position: { x: number; y: number },
  side: BilliardsRailSide
): boolean {
  const pocketIndexes =
    side === 'top' ? [0, 1] : side === 'right' ? [1, 3, 5] : side === 'bottom' ? [4, 5] : [0, 2, 4];
  const centers = getPocketCenters();

  return pocketIndexes.some((index) => {
    const pocket = centers[index];
    const dx = position.x - pocket.x;
    const dy = position.y - pocket.y;
    const inwardX = dx * (index === 0 || index === 2 || index === 4 ? 1 : -1);
    const inwardY = dy * (index <= 1 ? 1 : -1);

    if (index === 2 || index === 3) {
      // The fallback boundary is already one ball radius inside the jaw noses.
      // Keep the whole physical mouth open here and let the jaw bodies narrow it.
      const containmentHalfMouth = SIDE_POCKET_MOUTH / 2 + POCKET_MOUTH_CAPTURE_TOLERANCE;
      return inwardX >= -POCKET_CAPTURE_RADIUS && Math.abs(dy) <= containmentHalfMouth;
    }

    if (inwardX < -POCKET_CAPTURE_RADIUS || inwardY < -POCKET_CAPTURE_RADIUS) return false;

    const tangentOffset = Math.abs((inwardX - inwardY) / Math.SQRT2);
    const centerClearance =
      (CORNER_POCKET_MOUTH - BALL_RADIUS * 2) / 2 + POCKET_MOUTH_CAPTURE_TOLERANCE;
    return tangentOffset <= centerClearance;
  });
}

export function containBallInPocketTable(sample: BallBoundarySample): {
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
  const openLeft = position.x < minX && isPositionInPocketMouth(position, 'left');
  const openRight = position.x > maxX && isPositionInPocketMouth(position, 'right');
  const openTop = position.y < minY && isPositionInPocketMouth(position, 'top');
  const openBottom = position.y > maxY && isPositionInPocketMouth(position, 'bottom');
  let corrected = false;

  if (position.x < minX && !openLeft) {
    position.x = minX;
    if (velocity.x < 0) {
      velocity.x = Math.abs(velocity.x) * RAIL_BOUNDARY_DAMPING;
      velocity.y *= RAIL_TANGENT_DAMPING;
    }
    corrected = true;
  } else if (position.x > maxX && !openRight) {
    position.x = maxX;
    if (velocity.x > 0) {
      velocity.x = -Math.abs(velocity.x) * RAIL_BOUNDARY_DAMPING;
      velocity.y *= RAIL_TANGENT_DAMPING;
    }
    corrected = true;
  }

  if (position.y < minY && !openTop) {
    position.y = minY;
    if (velocity.y < 0) {
      velocity.y = Math.abs(velocity.y) * RAIL_BOUNDARY_DAMPING;
      velocity.x *= RAIL_TANGENT_DAMPING;
    }
    corrected = true;
  } else if (position.y > maxY && !openBottom) {
    position.y = maxY;
    if (velocity.y > 0) {
      velocity.y = -Math.abs(velocity.y) * RAIL_BOUNDARY_DAMPING;
      velocity.x *= RAIL_TANGENT_DAMPING;
    }
    corrected = true;
  }

  return { corrected, position, velocity };
}

let cachedPocketRailGeometry: {
  rails: PocketRailRectangle[];
  jaws: PocketJawGeometry[];
} | null = null;

export function getPocketRailGeometry(): {
  rails: PocketRailRectangle[];
  jaws: PocketJawGeometry[];
} {
  if (cachedPocketRailGeometry) return cachedPocketRailGeometry;
  const min = RAIL_THICKNESS;
  const maxX = TABLE_WIDTH - RAIL_THICKNESS;
  const maxY = TABLE_HEIGHT - RAIL_THICKNESS;
  const midY = TABLE_HEIGHT / 2;
  const cornerOffset = CORNER_POCKET_MOUTH / Math.SQRT2;
  const sideHalf = SIDE_POCKET_MOUTH / 2;
  const cornerNoseLeft = min + cornerOffset;
  const cornerNoseRight = maxX - cornerOffset;
  const cornerNoseTop = min + cornerOffset;
  const cornerNoseBottom = maxY - cornerOffset;
  const sideNoseTop = midY - sideHalf;
  const sideNoseBottom = midY + sideHalf;
  const triangleOuterSpan = 4;

  const rails: PocketRailRectangle[] = [
    {
      x: (cornerNoseLeft + cornerNoseRight) / 2,
      y: min / 2,
      width: cornerNoseRight - cornerNoseLeft,
      height: min,
      side: 'top'
    },
    {
      x: (cornerNoseLeft + cornerNoseRight) / 2,
      y: TABLE_HEIGHT - min / 2,
      width: cornerNoseRight - cornerNoseLeft,
      height: min,
      side: 'bottom'
    },
    {
      x: min / 2,
      y: (cornerNoseTop + sideNoseTop) / 2,
      width: min,
      height: sideNoseTop - cornerNoseTop,
      side: 'left'
    },
    {
      x: min / 2,
      y: (sideNoseBottom + cornerNoseBottom) / 2,
      width: min,
      height: cornerNoseBottom - sideNoseBottom,
      side: 'left'
    },
    {
      x: TABLE_WIDTH - min / 2,
      y: (cornerNoseTop + sideNoseTop) / 2,
      width: min,
      height: sideNoseTop - cornerNoseTop,
      side: 'right'
    },
    {
      x: TABLE_WIDTH - min / 2,
      y: (sideNoseBottom + cornerNoseBottom) / 2,
      width: min,
      height: cornerNoseBottom - sideNoseBottom,
      side: 'right'
    }
  ];

  const jaws: PocketJawGeometry[] = [
    {
      vertices: [
        { x: cornerOffset, y: 0 },
        { x: cornerNoseLeft + triangleOuterSpan, y: 0 },
        { x: cornerNoseLeft, y: min }
      ],
      face: [
        { x: cornerOffset, y: 0 },
        { x: cornerNoseLeft, y: min }
      ],
      side: 'top'
    },
    {
      vertices: [
        { x: 0, y: cornerOffset },
        { x: 0, y: cornerNoseTop + triangleOuterSpan },
        { x: min, y: cornerNoseTop }
      ],
      face: [
        { x: 0, y: cornerOffset },
        { x: min, y: cornerNoseTop }
      ],
      side: 'left'
    },
    {
      vertices: [
        { x: cornerNoseRight - triangleOuterSpan, y: 0 },
        { x: TABLE_WIDTH - cornerOffset, y: 0 },
        { x: cornerNoseRight, y: min }
      ],
      face: [
        { x: TABLE_WIDTH - cornerOffset, y: 0 },
        { x: cornerNoseRight, y: min }
      ],
      side: 'top'
    },
    {
      vertices: [
        { x: TABLE_WIDTH, y: cornerOffset },
        { x: TABLE_WIDTH, y: cornerNoseTop + triangleOuterSpan },
        { x: maxX, y: cornerNoseTop }
      ],
      face: [
        { x: TABLE_WIDTH, y: cornerOffset },
        { x: maxX, y: cornerNoseTop }
      ],
      side: 'right'
    },
    {
      vertices: [
        { x: 0, y: sideNoseTop - triangleOuterSpan },
        { x: 0, y: sideNoseTop + min },
        { x: min, y: sideNoseTop }
      ],
      face: [
        { x: 0, y: sideNoseTop + min },
        { x: min, y: sideNoseTop }
      ],
      side: 'left'
    },
    {
      vertices: [
        { x: 0, y: sideNoseBottom - min },
        { x: 0, y: sideNoseBottom + triangleOuterSpan },
        { x: min, y: sideNoseBottom }
      ],
      face: [
        { x: 0, y: sideNoseBottom - min },
        { x: min, y: sideNoseBottom }
      ],
      side: 'left'
    },
    {
      vertices: [
        { x: TABLE_WIDTH, y: sideNoseTop - triangleOuterSpan },
        { x: TABLE_WIDTH, y: sideNoseTop + min },
        { x: maxX, y: sideNoseTop }
      ],
      face: [
        { x: TABLE_WIDTH, y: sideNoseTop + min },
        { x: maxX, y: sideNoseTop }
      ],
      side: 'right'
    },
    {
      vertices: [
        { x: TABLE_WIDTH, y: sideNoseBottom - min },
        { x: TABLE_WIDTH, y: sideNoseBottom + triangleOuterSpan },
        { x: maxX, y: sideNoseBottom }
      ],
      face: [
        { x: TABLE_WIDTH, y: sideNoseBottom - min },
        { x: maxX, y: sideNoseBottom }
      ],
      side: 'right'
    },
    {
      vertices: [
        { x: 0, y: cornerNoseBottom - triangleOuterSpan },
        { x: 0, y: TABLE_HEIGHT - cornerOffset },
        { x: min, y: cornerNoseBottom }
      ],
      face: [
        { x: 0, y: TABLE_HEIGHT - cornerOffset },
        { x: min, y: cornerNoseBottom }
      ],
      side: 'left'
    },
    {
      vertices: [
        { x: cornerOffset, y: TABLE_HEIGHT },
        { x: cornerNoseLeft + triangleOuterSpan, y: TABLE_HEIGHT },
        { x: cornerNoseLeft, y: maxY }
      ],
      face: [
        { x: cornerOffset, y: TABLE_HEIGHT },
        { x: cornerNoseLeft, y: maxY }
      ],
      side: 'bottom'
    },
    {
      vertices: [
        { x: TABLE_WIDTH, y: cornerNoseBottom - triangleOuterSpan },
        { x: TABLE_WIDTH, y: TABLE_HEIGHT - cornerOffset },
        { x: maxX, y: cornerNoseBottom }
      ],
      face: [
        { x: TABLE_WIDTH, y: TABLE_HEIGHT - cornerOffset },
        { x: maxX, y: cornerNoseBottom }
      ],
      side: 'right'
    },
    {
      vertices: [
        { x: cornerNoseRight - triangleOuterSpan, y: TABLE_HEIGHT },
        { x: TABLE_WIDTH - cornerOffset, y: TABLE_HEIGHT },
        { x: cornerNoseRight, y: maxY }
      ],
      face: [
        { x: TABLE_WIDTH - cornerOffset, y: TABLE_HEIGHT },
        { x: cornerNoseRight, y: maxY }
      ],
      side: 'bottom'
    }
  ];

  cachedPocketRailGeometry = { rails, jaws };
  return cachedPocketRailGeometry;
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

export function computeFourBallCutAngles(
  shooter: { x: number; y: number },
  target: { x: number; y: number }
): number[] {
  const dx = target.x - shooter.x;
  const dy = target.y - shooter.y;
  const baseAngle = Math.atan2(dy, dx);
  const distance = Math.hypot(dx, dy);
  const contactHalfAngle = Math.asin(
    Math.min(1, (BALL_RADIUS * 2) / Math.max(distance, BALL_RADIUS * 2))
  );

  return FOUR_BALL_CUT_FACTORS.map((factor) => baseAngle + contactHalfAngle * factor);
}

export function computeFourBallHelpRating(
  robustnessCount: number,
  powerPercent: number,
  baseRating: number
): number {
  const robustness = Number.isFinite(robustnessCount)
    ? Math.max(0, Math.floor(robustnessCount))
    : 0;
  const power = Number.isFinite(powerPercent) ? Math.min(100, Math.max(0, powerPercent)) : 100;
  const fallbackRating = Number.isFinite(baseRating) ? baseRating : 0;
  return robustness * 1_000_000 - power * 1_000 + fallbackRating;
}

export function computeSpeedRatio(speed: number): number {
  return Math.max(0, Math.min(1, speed / MAX_SHOT_SPEED));
}

export function computeMaxCollisionSpeed(samples: BallMotionSample[]): number {
  let maxSpeed = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const velocity = samples[index].velocity;
    maxSpeed = Math.max(maxSpeed, Math.hypot(velocity.x, velocity.y));
    for (let otherIndex = index + 1; otherIndex < samples.length; otherIndex += 1) {
      const otherVelocity = samples[otherIndex].velocity;
      maxSpeed = Math.max(
        maxSpeed,
        Math.hypot(velocity.x - otherVelocity.x, velocity.y - otherVelocity.y)
      );
    }
  }
  return maxSpeed;
}

export function computePhysicsSubstepCount(maxSpeed: number, deltaMs: number): number {
  const safeSpeed = Number.isFinite(maxSpeed) ? Math.max(0, maxSpeed) : 0;
  const safeDelta = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
  const travel = safeSpeed * (safeDelta / PHYSICS_BASE_STEP_MS);
  return Math.max(
    1,
    Math.min(PHYSICS_MAX_SUBSTEPS, Math.ceil(travel / PHYSICS_MAX_TRAVEL_PER_STEP))
  );
}

export function computePhysicsFrameSlices(elapsedMs: number): number[] {
  const safeElapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  let remaining = Math.min(safeElapsed, PHYSICS_MAX_CATCH_UP_MS);
  const slices: number[] = [];

  while (remaining > PHYSICS_BASE_STEP_MS + PHYSICS_SLICE_TOLERANCE_MS) {
    slices.push(PHYSICS_BASE_STEP_MS);
    remaining -= PHYSICS_BASE_STEP_MS;
  }
  if (remaining > 0) slices.push(Math.min(remaining, PHYSICS_BASE_STEP_MS));
  return slices;
}

export function computeDynamicVelocityScale(speed: number, deltaMs: number): number {
  if (!Number.isFinite(speed) || speed <= 0) return 0;
  let remainingFrames = Math.max(0, deltaMs / PHYSICS_BASE_STEP_MS);
  let nextSpeed = speed;

  // Rolling resistance stays constant at normal speed. Only the last slow roll
  // tapers analytically so it eases to rest in finite time without an exponential tail.
  if (nextSpeed > LOW_SPEED_TAIL_START) {
    const framesToTail = (nextSpeed - LOW_SPEED_TAIL_START) / ROLLING_DECELERATION_PER_FRAME;
    const linearFrames = Math.min(remainingFrames, framesToTail);
    nextSpeed -= ROLLING_DECELERATION_PER_FRAME * linearFrames;
    remainingFrames -= linearFrames;
  }

  if (remainingFrames > 0) {
    const nextRootSpeed = Math.max(
      0,
      Math.sqrt(nextSpeed) -
        (ROLLING_DECELERATION_PER_FRAME * remainingFrames) / (2 * Math.sqrt(LOW_SPEED_TAIL_START))
    );
    nextSpeed = nextRootSpeed ** 2;
  }

  return nextSpeed / speed;
}

export function computeAngularVelocityScale(deltaMs: number): number {
  const frameScale = Math.max(0, deltaMs / PHYSICS_BASE_STEP_MS);
  return ANGULAR_FRICTION_DECAY ** frameScale;
}

export function computeRailEnergyScale(speed: number): number {
  return 0.94 - 0.12 * computeSpeedRatio(speed);
}

export function computeRailContactVelocityScale(speed: number): number {
  if (speed <= RAIL_CONTACT_STOP_SPEED) return 0;
  return 0.98 - 0.08 * computeSpeedRatio(speed);
}

export function computeRailReboundVelocity(
  velocity: { x: number; y: number },
  side: BilliardsRailSide,
  collisionNormal?: { x: number; y: number },
  sideSpin = 0
): { x: number; y: number } {
  const normalScale = RAIL_RESTITUTION / BALL_RESTITUTION;
  const inwardNormal =
    side === 'left'
      ? { x: 1, y: 0 }
      : side === 'right'
        ? { x: -1, y: 0 }
        : side === 'top'
          ? { x: 0, y: 1 }
          : { x: 0, y: -1 };
  const fallbackNormal = inwardNormal;
  const rawNormal = collisionNormal ?? fallbackNormal;
  const normalLength = Math.hypot(rawNormal.x, rawNormal.y);
  let normal =
    normalLength > 0
      ? { x: rawNormal.x / normalLength, y: rawNormal.y / normalLength }
      : fallbackNormal;
  if (normal.x * inwardNormal.x + normal.y * inwardNormal.y < 0) {
    normal = { x: -normal.x, y: -normal.y };
  }
  const tangent = { x: -normal.y, y: normal.x };
  const normalVelocity = velocity.x * normal.x + velocity.y * normal.y;
  const tangentVelocity = velocity.x * tangent.x + velocity.y * tangent.y;
  const englishKick =
    -Math.max(-1, Math.min(1, sideSpin / 100)) *
    Math.abs(normalVelocity) *
    CUE_SIDE_SPIN_RAIL_COUPLING;

  return {
    x:
      normal.x * normalVelocity * normalScale +
      tangent.x * (tangentVelocity * RAIL_TANGENT_DAMPING + englishKick),
    y:
      normal.y * normalVelocity * normalScale +
      tangent.y * (tangentVelocity * RAIL_TANGENT_DAMPING + englishKick)
  };
}

export function createCueSpinResponse(
  incomingCueVelocity: { x: number; y: number },
  incomingTargetVelocity: { x: number; y: number },
  contactNormal: { x: number; y: number },
  verticalSpin: number
): CueSpinResponse | null {
  const incomingSpeed = Math.hypot(incomingCueVelocity.x, incomingCueVelocity.y);
  const normalLength = Math.hypot(contactNormal.x, contactNormal.y);
  const spinRatio = Math.max(-1, Math.min(1, verticalSpin / 100));
  if (incomingSpeed <= STOP_SPEED || normalLength === 0 || spinRatio === 0) return null;

  const normal = { x: contactNormal.x / normalLength, y: contactNormal.y / normalLength };
  const relativeVelocity = {
    x: incomingCueVelocity.x - incomingTargetVelocity.x,
    y: incomingCueVelocity.y - incomingTargetVelocity.y
  };
  const closingSpeed = Math.max(0, relativeVelocity.x * normal.x + relativeVelocity.y * normal.y);
  if (closingSpeed === 0) return null;
  const contactScale = spinRatio > 0 ? CUE_FOLLOW_CONTACT_PUSH : CUE_BACKSPIN_CONTACT_PULL;

  return {
    direction: {
      x: incomingCueVelocity.x / incomingSpeed,
      y: incomingCueVelocity.y / incomingSpeed
    },
    remainingDeltaSpeed: closingSpeed * Math.abs(spinRatio) * contactScale * Math.sign(spinRatio),
    remainingMs: CUE_VERTICAL_SPIN_RESPONSE_MS
  };
}

export function advanceCueSpinResponse(
  velocity: { x: number; y: number },
  response: CueSpinResponse,
  deltaMs: number
): { velocity: { x: number; y: number }; response: CueSpinResponse | null } {
  if (response.remainingMs <= 0 || response.remainingDeltaSpeed === 0 || deltaMs <= 0) {
    return { velocity: { ...velocity }, response: null };
  }
  const appliedMs = Math.min(response.remainingMs, deltaMs);
  const appliedRatio = appliedMs / response.remainingMs;
  const appliedDeltaSpeed = response.remainingDeltaSpeed * appliedRatio;
  const remainingMs = response.remainingMs - appliedMs;
  const remainingDeltaSpeed = response.remainingDeltaSpeed - appliedDeltaSpeed;

  return {
    velocity: {
      x: velocity.x + response.direction.x * appliedDeltaSpeed,
      y: velocity.y + response.direction.y * appliedDeltaSpeed
    },
    response:
      remainingMs > 0.0001 && Math.abs(remainingDeltaSpeed) > 0.0001
        ? { ...response, remainingDeltaSpeed, remainingMs }
        : null
  };
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
    return 0;
  }
  return CUE_MASSE_CURVE_BOOST * sideRatio * verticalRatio;
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
  const hitRedIds = Array.from(new Set(contacts.map((contact) => contact.targetId)));

  return {
    scored: hitRedIds.length >= 2,
    hitRedIds
  };
}

export function computeFourBallComboMultiplier(streak: number): number {
  const normalizedStreak = Math.max(1, Math.floor(streak));
  return Math.min(FOUR_BALL_MAX_COMBO_MULTIPLIER, 1 + (normalizedStreak - 1) * 0.5);
}

export function computeFourBallShotScore(streak: number): number {
  return FOUR_BALL_BASE_SCORE * computeFourBallComboMultiplier(streak);
}

export function computeFourBallFoulPenalty(hitRedCount: number, hitOpponentCue: boolean): number {
  return (
    (hitRedCount <= 0 ? FOUR_BALL_FOUL_PENALTY : 0) + (hitOpponentCue ? FOUR_BALL_FOUL_PENALTY : 0)
  );
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

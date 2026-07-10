/** 블록깨기 게임 로직 — Arkanoid/Breakout 규칙 기반 */

export const CANVAS_WIDTH = 480;
export const CANVAS_HEIGHT = 640;

export const PADDLE_WIDTH = 80;
export const PADDLE_HEIGHT = 14;
export const PADDLE_Y = CANVAS_HEIGHT - 40;
export const PADDLE_SPEED = 8;

export const BALL_RADIUS = 8;
export const INITIAL_BALL_SPEED = 5;

export const BRICK_COLS = 10;
export const BRICK_ROWS = 6;
export const BRICK_PADDING = 4;
export const BRICK_OFFSET_TOP = 60;
export const BRICK_OFFSET_LEFT = 20;

export const INITIAL_LIVES = 3;
export const MAX_LIVES = 5;

export type BreakoutScreen =
  | 'menu'
  | 'playing'
  | 'paused'
  | 'stageClear'
  | 'gameOver'
  | 'gameWin'
  | 'ready'
  | 'bonusIntro';

export interface LifeLossResult {
  lives: number;
  shieldCharges: number;
  gameOver: boolean;
  shieldUsed: boolean;
}

/**
 * 공 낙하 시 목숨/보호막 처리. lives가 0 이하이면 보호막 없이 즉시 게임오버.
 */
export function resolveLifeLoss(lives: number, shieldCharges: number): LifeLossResult {
  if (lives <= 0) {
    return { lives, shieldCharges, gameOver: true, shieldUsed: false };
  }
  if (shieldCharges > 0) {
    return { lives, shieldCharges: shieldCharges - 1, gameOver: false, shieldUsed: true };
  }
  const nextLives = lives - 1;
  return {
    lives: nextLives,
    shieldCharges,
    gameOver: nextLives <= 0,
    shieldUsed: false
  };
}

/** 게임 루프를 계속 돌려야 하는 화면인지 */
export function shouldContinueGameLoop(screen: BreakoutScreen): boolean {
  return screen === 'playing' || screen === 'ready' || screen === 'paused' || screen === 'stageClear';
}

export const PADDLE_EXPAND_MULTIPLIER = 1.55;
export const PADDLE_SHRINK_MULTIPLIER = 0.62;
export const PADDLE_EXPAND_DURATION_MS = 15_000;
export const PADDLE_SHRINK_DURATION_MS = 12_000;
export const SLOW_BALL_DURATION_MS = 10_000;
export const FAST_BALL_DURATION_MS = 10_000;
export const SLOW_BALL_SPEED_RATIO = 0.65;
export const FAST_BALL_SPEED_RATIO = 1.45;
export const INVINCIBLE_BALL_DURATION_MS = 8_000;
export const LASER_DURATION_MS = 10_000;
export const LASER_INTERVAL_MS = 380;
export const LASER_SPEED = 11;
export const COMBO_WINDOW_MS = 1_500;
export const POWER_UP_FALL_SPEED = 2.8;
export const POWER_UP_SIZE = 18;

export type BrickType = 'normal' | 'strong' | 'explosive' | 'iron' | 'rainbow';
export type PowerUpType =
  | 'multiball'
  | 'expand'
  | 'extraLife'
  | 'slow'
  | 'fast'
  | 'shrink'
  | 'invincible'
  | 'shield'
  | 'laser'
  | 'bomb';

export interface Brick {
  x: number;
  y: number;
  width: number;
  height: number;
  type: BrickType;
  hits: number;
  maxHits: number;
  alive: boolean;
  color: string;
  points: number;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  /** 스핀: 음수=좌커브, 양수=우커브 */
  spin?: number;
}

export interface Paddle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PowerUp {
  id: string;
  type: PowerUpType;
  x: number;
  y: number;
  width: number;
  height: number;
  vy: number;
  alive: boolean;
}

export interface Laser {
  id: string;
  x: number;
  y: number;
  vy: number;
  alive: boolean;
}

export interface ActiveEffects {
  expandPaddleUntil: number;
  shrinkPaddleUntil: number;
  slowBallsUntil: number;
  fastBallsUntil: number;
  invincibleBallUntil: number;
  laserUntil: number;
}

export type StageKind = 'normal' | 'theme' | 'bonus';

export type PatternId =
  | 'full'
  | 'pyramid'
  | 'diamond'
  | 'checker'
  | 'tunnel'
  | 'U'
  | 'walls'
  | 'sparse'
  | 'cushion'
  | 'pockets'
  | 'lane'
  | 'cage'
  | 'bank';

export interface StageConfig {
  stage: number;
  label: string;
  kind: StageKind;
  pattern: PatternId;
  ballSpeed: number;
  strongRatio: number;
  explosiveRatio: number;
  ironRatio: number;
  rainbowRatio: number;
}

export const TOTAL_STAGES = 50;
export const BONUS_CLEAR_MULTIPLIER = 2;
export const BONUS_DROP_CHANCE_MULTIPLIER = 1.35;
export const BONUS_MAX_ATTEMPTS = 2;

/** 조준각: 수평 기준 도(°). 90=수직 위, 작을수록 오른쪽 */
export const AIM_ANGLE_MIN = 25;
export const AIM_ANGLE_MAX = 155;
export const DEFAULT_AIM_ANGLE = 90;
export const AIM_ANGLE_STEP = 2.5;
export const AIM_LINE_LENGTH = 120;

/** 별 소나기(구 스핀샷): 빠른 공 + 20초 생존·수집 */
export const SPIN_BALL_SPEED = 5.5;
export const SPIN_TIME_LIMIT_MS = 20_000;
export const STAR_RAIN_SPAWN_INTERVAL_MS = 320;
export const STAR_RAIN_MAX_ACTIVE = 14;
export const STAR_RAIN_FALL_MIN = 2.4;
export const STAR_RAIN_FALL_MAX = 5.2;

/** @deprecated 스핀 물리 제거됨 — 호환용 상수만 유지 */
export const SPIN_MIN = -3;
export const SPIN_MAX = 3;
export const SPIN_STEP = 1;
export const DEFAULT_SPIN = 0;
export const SPIN_CURVE_RATE = 0.028;
export const SPIN_CUSHION_DECAY = 0.85;
export const SPIN_AIM_PREVIEW_STEPS = 12;

const BONUS_STAGES = new Set([1, 5, 15, 25, 35, 45]);
const THEME_STAGES = new Set([10, 20, 30, 40, 50]);

const THEME_LABELS: Record<number, string> = {
  10: '철 미로',
  20: '폭발 연쇄',
  30: '무지개 사냥',
  40: '성벽',
  50: '최종'
};

const BONUS_LABELS: Record<number, string> = {
  1: '이동 공(테스트)',
  5: '3쿠션 챌린지',
  15: '별 먹기',
  25: '보석 회수',
  35: '골든샷',
  45: '금고 열기'
};

export type BonusChallengeType =
  | 'billiard'
  | 'stars'
  | 'gems'
  | 'golden'
  | 'vault'
  | 'spin'
  | 'movers';

const BONUS_CHALLENGE_BY_STAGE: Record<number, BonusChallengeType> = {
  1: 'movers',
  5: 'billiard',
  15: 'stars',
  25: 'gems',
  35: 'golden',
  45: 'vault'
};

/** 보너스 스테이지 챌린지 종류 */
export function getBonusChallengeType(stage: number): BonusChallengeType {
  const s = clampStage(stage);
  return BONUS_CHALLENGE_BY_STAGE[s] ?? 'billiard';
}

const NORMAL_PATTERN_POOL: PatternId[] = [
  'full',
  'pyramid',
  'diamond',
  'checker',
  'tunnel',
  'U',
  'walls',
  'sparse'
];

/** 보너스 스테이지별 고정 퍼즐 패턴 */
const BONUS_PATTERN_BY_STAGE: Record<number, PatternId> = {
  1: 'cushion',
  5: 'cushion',
  15: 'pockets',
  25: 'lane',
  35: 'cage',
  45: 'bank'
};

/**
 * 보너스 퍼즐 맵 — 문자 그리드
 * . 빈칸 / I 철 / N 일반 / S 내구 / E 폭발 / R 무지개
 * 철로 통로·포켓을 만들고, 그 사이 벽돌만 깨면 클리어 (당구 3쿠션 감성)
 */
const BONUS_PUZZLE_MAPS: Record<PatternId, string[]> = {
  cushion: [
    'IIIIIIIIII',
    'I........I',
    'I..NNNN..I',
    'I........I',
    'I..IIII..I',
    'I........I'
  ],
  pockets: [
    'I.I....I.I',
    'I.INNNNI.I',
    'I.I....I.I',
    'IIII..IIII',
    '....NN....',
    'I........I'
  ],
  lane: [
    'IIII..IIII',
    'I..N..N..I',
    'I..IIII..I',
    'I..N..N..I',
    'I..IIII..I',
    'I........I'
  ],
  cage: [
    'IIIIIIIIII',
    'I.N.II.N.I',
    'I...II...I',
    'IIII..IIII',
    'I.N....N.I',
    'I........I'
  ],
  bank: [
    'I........I',
    'I.IIIIII.I',
    'I.I.NN.I.I',
    'I.I....I.I',
    'I.INNNNI.I',
    'I........I'
  ],
  full: [],
  pyramid: [],
  diamond: [],
  checker: [],
  tunnel: [],
  U: [],
  walls: [],
  sparse: []
};

function parsePuzzleCell(ch: string): BrickType | null {
  switch (ch) {
    case 'I':
      return 'iron';
    case 'N':
      return 'normal';
    case 'S':
      return 'strong';
    case 'E':
      return 'explosive';
    case 'R':
      return 'rainbow';
    default:
      return null;
  }
}

/** 보너스 스테이지 고정 타입 그리드 (null=빈칸) */
export function getBonusPuzzleGrid(stage: number): (BrickType | null)[][] | null {
  if (getStageKind(stage) !== 'bonus') return null;
  const pattern = getStagePattern(stage);
  const rows = BONUS_PUZZLE_MAPS[pattern];
  if (!rows || rows.length === 0) return null;
  return rows.map((row) =>
    row
      .padEnd(BRICK_COLS, '.')
      .slice(0, BRICK_COLS)
      .split('')
      .map((ch) => parsePuzzleCell(ch))
  );
}

function roundStageValue(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clampStage(stage: number): number {
  return Math.min(Math.max(stage, 1), TOTAL_STAGES);
}

/** 스테이지 종류: 보너스(5의 배수 중 테마 제외) / 테마(10단위) / 일반 */
export function getStageKind(stage: number): StageKind {
  const s = clampStage(stage);
  if (BONUS_STAGES.has(s)) return 'bonus';
  if (THEME_STAGES.has(s)) return 'theme';
  return 'normal';
}

/** 시드 기반 패턴 선택 — 같은 stage면 항상 같은 패턴 */
export function getStagePattern(stage: number): PatternId {
  const s = clampStage(stage);
  const kind = getStageKind(s);
  if (kind === 'bonus') {
    return BONUS_PATTERN_BY_STAGE[s] ?? 'cushion';
  }
  if (kind === 'theme') {
    if (s === 10) return 'tunnel';
    if (s === 20) return 'checker';
    if (s === 30) return 'sparse';
    if (s === 40) return 'walls';
    return 'diamond';
  }
  if (s === 1) return 'full';
  return NORMAL_PATTERN_POOL[(s - 1) % NORMAL_PATTERN_POOL.length];
}

function emptyMask(): boolean[][] {
  return Array.from({ length: BRICK_ROWS }, () => Array.from({ length: BRICK_COLS }, () => false));
}

function fillMask(predicate: (row: number, col: number) => boolean): boolean[][] {
  const mask = emptyMask();
  for (let row = 0; row < BRICK_ROWS; row++) {
    for (let col = 0; col < BRICK_COLS; col++) {
      mask[row][col] = predicate(row, col);
    }
  }
  return mask;
}

function buildPatternMask(pattern: PatternId): boolean[][] {
  const midCol = (BRICK_COLS - 1) / 2;
  const midRow = (BRICK_ROWS - 1) / 2;
  const puzzleRows = BONUS_PUZZLE_MAPS[pattern];
  if (puzzleRows && puzzleRows.length > 0) {
    return puzzleRows.map((row) =>
      row
        .padEnd(BRICK_COLS, '.')
        .slice(0, BRICK_COLS)
        .split('')
        .map((ch) => parsePuzzleCell(ch) != null)
    );
  }

  switch (pattern) {
    case 'full':
      return fillMask(() => true);
    case 'pyramid':
      return fillMask((row, col) => {
        const half = Math.floor(row / 2) + 1;
        return col >= midCol - half && col <= midCol + half;
      });
    case 'diamond':
      return fillMask((row, col) => {
        const dist = Math.abs(row - midRow) + Math.abs(col - midCol);
        return dist <= 3.5;
      });
    case 'checker':
      return fillMask((row, col) => (row + col) % 2 === 0);
    case 'tunnel':
      return fillMask((row, col) => col <= 1 || col >= BRICK_COLS - 2 || row === 0 || row === 2 || row === 4);
    case 'U':
      return fillMask((row, col) => col === 0 || col === BRICK_COLS - 1 || row === BRICK_ROWS - 1);
    case 'walls':
      return fillMask((row, col) => row === 0 || row === BRICK_ROWS - 1 || col === 0 || col === BRICK_COLS - 1 || row === 2);
    case 'sparse':
      return fillMask((row, col) => (row + col) % 3 === 0);
    default:
      return fillMask(() => true);
  }
}

/** 스테이지별 블록 배치 마스크 (시드=stage, 재현 가능) */
export function getBrickMask(stage: number): boolean[][] {
  return buildPatternMask(getStagePattern(stage));
}

/** 스테이지 난이도 곡선 + 테마/보너스 오버라이드 */
export function buildStageConfig(stage: number): StageConfig {
  const clamped = clampStage(stage);
  const t = (clamped - 1) / (TOTAL_STAGES - 1);
  const kind = getStageKind(clamped);
  const pattern = getStagePattern(clamped);

  let ballSpeed = roundStageValue(5 + t * 7, 1);
  let strongRatio = roundStageValue(0.08 + t * 0.4);
  let explosiveRatio = roundStageValue(0.05 + t * 0.16);
  let ironRatio = clamped === 1 ? 0 : roundStageValue(0.02 + t * 0.16);
  let rainbowRatio = roundStageValue(0.03 + Math.sin(t * Math.PI) * 0.02);
  let label = `${clamped}단계`;

  if (kind === 'bonus') {
    label = BONUS_LABELS[clamped] ?? '당구 퍼즐';
    ballSpeed = roundStageValue(Math.max(4.8, ballSpeed * 0.78), 1);
    if (getBonusChallengeType(clamped) === 'spin') {
      ballSpeed = SPIN_BALL_SPEED;
    }
    // 고정 퍼즐 맵이 타입을 결정 — 비율은 표시/폴백만
    strongRatio = 0;
    explosiveRatio = 0;
    ironRatio = 0.4;
    rainbowRatio = 0;
  } else if (kind === 'theme') {
    label = THEME_LABELS[clamped] ?? label;
    if (clamped === 10) {
      ironRatio = 0.28;
      strongRatio = 0.12;
      explosiveRatio = 0.08;
      rainbowRatio = 0.04;
    } else if (clamped === 20) {
      explosiveRatio = 0.32;
      strongRatio = 0.15;
      ironRatio = 0.04;
      rainbowRatio = 0.05;
    } else if (clamped === 30) {
      rainbowRatio = 0.35;
      strongRatio = 0.1;
      explosiveRatio = 0.08;
      ironRatio = 0.05;
    } else if (clamped === 40) {
      ironRatio = 0.22;
      strongRatio = 0.3;
      explosiveRatio = 0.12;
      rainbowRatio = 0.04;
    } else if (clamped === 50) {
      label = '최종';
      ballSpeed = 12;
      strongRatio = 0.35;
      explosiveRatio = 0.18;
      ironRatio = 0.2;
      rainbowRatio = 0.06;
    }
  }

  const specialSum = strongRatio + explosiveRatio + ironRatio + rainbowRatio;
  if (specialSum >= 0.9) {
    const scale = 0.88 / specialSum;
    strongRatio = roundStageValue(strongRatio * scale);
    explosiveRatio = roundStageValue(explosiveRatio * scale);
    ironRatio = roundStageValue(ironRatio * scale);
    rainbowRatio = roundStageValue(rainbowRatio * scale);
  }

  return {
    stage: clamped,
    label,
    kind,
    pattern,
    ballSpeed,
    strongRatio,
    explosiveRatio,
    ironRatio,
    rainbowRatio
  };
}

export const STAGES: StageConfig[] = Array.from({ length: TOTAL_STAGES }, (_, i) =>
  buildStageConfig(i + 1)
);

export const BRICK_COLORS: Record<BrickType, string> = {
  normal: '#4fc3f7',
  strong: '#ff7043',
  explosive: '#ffca28',
  iron: '#616161',
  rainbow: '#e040fb'
};

const BRICK_POINTS: Record<BrickType, number> = {
  normal: 10,
  strong: 30,
  explosive: 20,
  iron: 0,
  rainbow: 50
};

export const POWER_UP_META: Record<
  PowerUpType,
  { label: string; color: string; symbol: string; bad: boolean; durationMs?: number }
> = {
  multiball: { label: '멀티볼', color: '#81d4fa', symbol: '●●', bad: false },
  expand: { label: '패들 확대', color: '#a5d6a7', symbol: '↔', bad: false, durationMs: PADDLE_EXPAND_DURATION_MS },
  extraLife: { label: '추가 목숨', color: '#f48fb1', symbol: '♥', bad: false },
  slow: { label: '슬로우', color: '#ce93d8', symbol: '▼', bad: false, durationMs: SLOW_BALL_DURATION_MS },
  fast: { label: '가속', color: '#ef9a9a', symbol: '▲', bad: true, durationMs: FAST_BALL_DURATION_MS },
  shrink: { label: '패들 축소', color: '#ffab91', symbol: '⇔', bad: true, durationMs: PADDLE_SHRINK_DURATION_MS },
  invincible: { label: '무적공', color: '#fff176', symbol: '☄', bad: false, durationMs: INVINCIBLE_BALL_DURATION_MS },
  shield: { label: '보호막', color: '#80cbc4', symbol: '🛡', bad: false },
  laser: { label: '레이저', color: '#ff8a80', symbol: '🔫', bad: false, durationMs: LASER_DURATION_MS },
  bomb: { label: '전체 폭파', color: '#ff6f00', symbol: '💣', bad: false }
};

const POWER_UP_DROP_CHANCE: Record<BrickType, number> = {
  normal: 0.14,
  strong: 0.24,
  explosive: 0.3,
  iron: 0,
  rainbow: 1
};

const GOOD_POWER_UPS: PowerUpType[] = [
  'multiball', 'expand', 'extraLife', 'slow', 'invincible', 'shield', 'laser', 'bomb'
];
const BAD_POWER_UPS: PowerUpType[] = ['fast', 'shrink'];
const RAINBOW_POWER_UPS: PowerUpType[] = ['multiball', 'invincible', 'shield', 'laser', 'bomb', 'expand'];

let powerUpIdCounter = 0;
let laserIdCounter = 0;

/** 파괴 가능 블록 여부 */
export function isDestroyableBrick(brick: Brick): boolean {
  return brick.alive && brick.type !== 'iron';
}

/** 활성 효과 초기값 */
export function createActiveEffects(): ActiveEffects {
  return {
    expandPaddleUntil: 0,
    shrinkPaddleUntil: 0,
    slowBallsUntil: 0,
    fastBallsUntil: 0,
    invincibleBallUntil: 0,
    laserUntil: 0
  };
}

/** 스테이지별 블록 생성 — 보너스는 고정 퍼즐, 나머지는 마스크+비율 */
export function createBricks(stage: number): Brick[] {
  const config = getStageConfig(stage);
  const brickWidth =
    (CANVAS_WIDTH - BRICK_OFFSET_LEFT * 2 - BRICK_PADDING * (BRICK_COLS - 1)) / BRICK_COLS;
  const brickHeight = 22;
  const bricks: Brick[] = [];

  const pushBrick = (row: number, col: number, type: BrickType) => {
    const maxHits = type === 'strong' ? 2 : type === 'iron' ? 999 : 1;
    bricks.push({
      x: BRICK_OFFSET_LEFT + col * (brickWidth + BRICK_PADDING),
      y: BRICK_OFFSET_TOP + row * (brickHeight + BRICK_PADDING),
      width: brickWidth,
      height: brickHeight,
      type,
      hits: 0,
      maxHits,
      alive: true,
      color: BRICK_COLORS[type],
      points: BRICK_POINTS[type]
    });
  };

  const puzzle = getBonusPuzzleGrid(stage);
  if (puzzle) {
    for (let row = 0; row < BRICK_ROWS; row++) {
      for (let col = 0; col < BRICK_COLS; col++) {
        const type = puzzle[row]?.[col] ?? null;
        if (!type) continue;
        pushBrick(row, col, type);
      }
    }
    return bricks;
  }

  const mask = getBrickMask(stage);
  const rollType = (): BrickType => {
    const rand = Math.random();
    let cursor = 0;
    cursor += config.rainbowRatio;
    if (rand < cursor) return 'rainbow';
    cursor += config.ironRatio;
    if (rand < cursor) return 'iron';
    cursor += config.explosiveRatio;
    if (rand < cursor) return 'explosive';
    cursor += config.strongRatio;
    if (rand < cursor) return 'strong';
    return 'normal';
  };

  for (let row = 0; row < BRICK_ROWS; row++) {
    for (let col = 0; col < BRICK_COLS; col++) {
      if (!mask[row][col]) continue;
      pushBrick(row, col, rollType());
    }
  }

  // 파괴 가능 블록 최소 1개 보장 (철만 나오거나 마스크 비면 보정)
  if (bricks.filter(isDestroyableBrick).length === 0) {
    if (bricks.length > 0) {
      const idx = Math.floor(bricks.length / 2);
      bricks[idx] = {
        ...bricks[idx],
        type: 'normal',
        hits: 0,
        maxHits: 1,
        color: BRICK_COLORS.normal,
        points: BRICK_POINTS.normal
      };
    } else {
      pushBrick(Math.floor(BRICK_ROWS / 2), Math.floor(BRICK_COLS / 2), 'normal');
    }
  }

  return bricks;
}

export function getStageConfig(stage: number): StageConfig {
  const index = Math.min(Math.max(stage, 1), STAGES.length) - 1;
  return STAGES[index];
}

export function isGameComplete(stage: number): boolean {
  return stage > STAGES.length;
}

export function countDestroyableBricks(bricks: Brick[]): number {
  return bricks.filter(isDestroyableBrick).length;
}

/** 파괴 가능 블록이 모두 없어지면 클리어 (철 블록 제외) */
export function isStageClear(bricks: Brick[]): boolean {
  return countDestroyableBricks(bricks) === 0;
}

export function createPaddle(width = PADDLE_WIDTH): Paddle {
  return {
    x: (CANVAS_WIDTH - width) / 2,
    y: PADDLE_Y,
    width,
    height: PADDLE_HEIGHT
  };
}

export function createBall(paddle: Paddle, speed: number): Ball {
  return {
    x: paddle.x + paddle.width / 2,
    y: paddle.y - BALL_RADIUS - 2,
    vx: speed * (Math.random() > 0.5 ? 1 : -1) * 0.7,
    vy: -speed,
    radius: BALL_RADIUS
  };
}

export function clampAimAngle(angleDeg: number): number {
  return Math.max(AIM_ANGLE_MIN, Math.min(AIM_ANGLE_MAX, angleDeg));
}

/** 드래그바 비율(0=왼쪽~1=오른쪽) → 조준각 */
export function aimAngleFromDragRatio(ratio: number): number {
  const t = Math.max(0, Math.min(1, ratio));
  return clampAimAngle(AIM_ANGLE_MAX - t * (AIM_ANGLE_MAX - AIM_ANGLE_MIN));
}

export function dragRatioFromAimAngle(angleDeg: number): number {
  const angle = clampAimAngle(angleDeg);
  return (AIM_ANGLE_MAX - angle) / (AIM_ANGLE_MAX - AIM_ANGLE_MIN);
}

/** 조준각으로 공 발사 벡터 생성 */
export function createAimedBall(
  paddle: Paddle,
  speed: number,
  angleDeg: number,
  spin = 0
): Ball {
  const rad = (clampAimAngle(angleDeg) * Math.PI) / 180;
  return {
    x: paddle.x + paddle.width / 2,
    y: paddle.y - BALL_RADIUS - 2,
    vx: Math.cos(rad) * speed,
    vy: -Math.sin(rad) * speed,
    radius: BALL_RADIUS,
    spin: clampSpin(spin)
  };
}

export function clampSpin(spin: number): number {
  return Math.max(SPIN_MIN, Math.min(SPIN_MAX, Math.round(spin)));
}

/**
 * 스핀으로 속도 벡터를 살짝 회전(커브). 속도 크기는 유지하지 않음 — 호출측에서 normalize.
 */
export function applyBallSpin(ball: Ball, curveRate = SPIN_CURVE_RATE): Ball {
  const spin = ball.spin ?? 0;
  if (spin === 0) return ball;
  const angle = spin * curveRate;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    ...ball,
    vx: ball.vx * cos - ball.vy * sin,
    vy: ball.vx * sin + ball.vy * cos
  };
}

/** 쿠션 충돌 후 스핀 감쇠 */
export function decaySpinOnCushion(ball: Ball, factor = SPIN_CUSHION_DECAY): Ball {
  const spin = ball.spin ?? 0;
  if (spin === 0) return ball;
  const next = spin * factor;
  if (Math.abs(next) < 0.15) return { ...ball, spin: 0 };
  return { ...ball, spin: next };
}

/**
 * 스핀 조준 곡선 미리보기 점들.
 * 쿠션 반사는 단순화(미포함) — 발사 직후 커브만 표시.
 */
export function getSpinAimPreviewPoints(
  originX: number,
  originY: number,
  angleDeg: number,
  spin: number,
  speed: number,
  steps = SPIN_AIM_PREVIEW_STEPS
): Array<{ x: number; y: number }> {
  let ball: Ball = {
    x: originX,
    y: originY,
    vx: Math.cos((clampAimAngle(angleDeg) * Math.PI) / 180) * speed,
    vy: -Math.sin((clampAimAngle(angleDeg) * Math.PI) / 180) * speed,
    radius: BALL_RADIUS,
    spin: clampSpin(spin)
  };
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < steps; i++) {
    ball = moveBall(ball);
    ball = applyBallSpin(ball);
    ball = normalizeBallSpeed(ball, speed);
    points.push({ x: ball.x, y: ball.y });
  }
  return points;
}

export function getAimLineEnd(
  originX: number,
  originY: number,
  angleDeg: number,
  length = AIM_LINE_LENGTH
): { x: number; y: number } {
  const rad = (clampAimAngle(angleDeg) * Math.PI) / 180;
  return {
    x: originX + Math.cos(rad) * length,
    y: originY - Math.sin(rad) * length
  };
}

export type BonusMissResult = 'retry' | 'skip';

/** 보너스 공 낙하: 목숨 안 깎고 재시도 or 스킵 */
export function resolveBonusMiss(
  attemptsUsed: number,
  maxAttempts = BONUS_MAX_ATTEMPTS
): BonusMissResult {
  return attemptsUsed < maxAttempts ? 'retry' : 'skip';
}

/** 1발 클리어면 2배, 2발째면 1배 */
export function getBonusShotClearMultiplier(attemptsUsed: number): number {
  return attemptsUsed <= 1 ? BONUS_CLEAR_MULTIPLIER : 1;
}

export type BonusClearGrade = 'S' | 'A' | 'B' | 'C';

export interface BonusClearScoreLine {
  label: string;
  value: number;
  /** 표시 시작 지연(ms) */
  delayMs: number;
}

export interface BonusClearPerformance {
  title: string;
  lines: BonusClearScoreLine[];
  grade: BonusClearGrade;
  gradeLabel: string;
  totalAdded: number;
  shotMultiplier: number;
  attemptsUsed: number;
}

/**
 * 보너스 클리어 점수 퍼포먼스 데이터.
 * playScore = 스테이지 중 획득분. 1발이면 playScore를 한 번 더 더해 ×2.
 */
export function buildBonusClearPerformance(params: {
  challenge: BonusChallengeType;
  stage: number;
  playScore: number;
  attemptsUsed: number;
  starRainCaught?: number;
}): BonusClearPerformance {
  const { challenge, stage, attemptsUsed } = params;
  const playScore = Math.max(0, Math.floor(params.playScore));
  const shotMultiplier = getBonusShotClearMultiplier(attemptsUsed);
  const clearBonus = getStageClearBonus(stage, attemptsUsed);
  const displayTotal = playScore * shotMultiplier + clearBonus;

  const lines: BonusClearScoreLine[] = [
    { label: '플레이 점수', value: playScore, delayMs: 200 }
  ];
  if (shotMultiplier > 1) {
    lines.push({ label: '1발 클리어 ×2', value: playScore, delayMs: 700 });
  }
  lines.push({
    label: shotMultiplier > 1 ? '클리어 보너스 ×2' : '클리어 보너스',
    value: clearBonus,
    delayMs: shotMultiplier > 1 ? 1200 : 700
  });
  lines.push({
    label: '합계',
    value: displayTotal,
    delayMs: shotMultiplier > 1 ? 1700 : 1200
  });

  const grade = getBonusClearGrade(challenge, {
    attemptsUsed,
    playScore,
    starRainCaught: params.starRainCaught ?? 0
  });

  const titles: Record<BonusChallengeType, string> = {
    billiard: '🎱 당구 클리어',
    stars: '⭐ 별 클리어',
    spin: '⭐ 별 소나기 결과',
    movers: '🔵 이동 공 클리어',
    gems: '💎 보석 클리어',
    golden: '🪙 골든샷 결과',
    vault: '🔐 금고 개방'
  };

  return {
    title: titles[challenge] ?? '보너스 클리어',
    lines,
    grade,
    gradeLabel: grade === 'S' ? 'PERFECT' : grade === 'A' ? 'GREAT' : grade === 'B' ? 'GOOD' : 'OK',
    totalAdded: displayTotal,
    shotMultiplier,
    attemptsUsed
  };
}

/** 보너스 클리어 등급 */
export function getBonusClearGrade(
  challenge: BonusChallengeType,
  stats: { attemptsUsed: number; playScore: number; starRainCaught: number }
): BonusClearGrade {
  if (challenge === 'spin') {
    const n = stats.starRainCaught;
    if (n >= 22) return 'S';
    if (n >= 14) return 'A';
    if (n >= 7) return 'B';
    return 'C';
  }
  if (stats.attemptsUsed <= 1) {
    if (stats.playScore >= 2000) return 'S';
    return 'A';
  }
  if (stats.playScore >= 1200) return 'B';
  return 'C';
}

// ——— 4구 당구 보너스 ———

export type BilliardBallKind = 'cue' | 'red' | 'yellow';

export interface BilliardBall {
  id: string;
  kind: BilliardBallKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  /** 목표 공(빨강/노랑)이 흰공에 맞았는지 */
  hit: boolean;
  color: string;
}

export const BILLIARD_RADIUS = 11;
export const BILLIARD_TIME_LIMIT_MS = 45_000;
/** 이동 공 보너스 제한시간 */
export const MOVERS_TIME_LIMIT_MS = 30_000;
/** 이동 목표공 순찰 속도 */
export const MOVERS_BALL_SPEED = 2.2;

/** 보너스 챌린지별 제한시간 */
export function getBonusTimeLimitMs(challenge: BonusChallengeType): number {
  if (challenge === 'spin') return SPIN_TIME_LIMIT_MS;
  if (challenge === 'movers') return MOVERS_TIME_LIMIT_MS;
  return BILLIARD_TIME_LIMIT_MS;
}
export const BILLIARD_TABLE_TOP = 48;
export const BILLIARD_TABLE_BOTTOM = CANVAS_HEIGHT - 28;
export const BILLIARD_HIT_SCORE = 120;

const BILLIARD_COLORS: Record<BilliardBallKind, string> = {
  cue: '#f5f5f5',
  red: '#e53935',
  yellow: '#fdd835'
};

/** 스테이지별 필요 쿠션 횟수 */
export function getRequiredCushions(stage: number): number {
  const s = clampStage(stage);
  if (s <= 5) return 1;
  if (s <= 15) return 2;
  if (s <= 25) return 3;
  if (s <= 35) return 3;
  return 4;
}

function makeBilliardBall(
  id: string,
  kind: Exclude<BilliardBallKind, 'cue'>,
  x: number,
  y: number
): BilliardBall {
  return {
    id,
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    radius: BILLIARD_RADIUS,
    hit: false,
    color: BILLIARD_COLORS[kind]
  };
}

/** 보너스 테이블에 빨간 2 + 노란 1 배치 (스테이지별 레이아웃) */
export function createBilliardObjectBalls(stage: number): BilliardBall[] {
  const pattern = getStagePattern(stage);
  const midX = CANVAS_WIDTH / 2;
  const layouts: Record<string, BilliardBall[]> = {
    cushion: [
      makeBilliardBall('r1', 'red', midX - 70, 160),
      makeBilliardBall('r2', 'red', midX + 80, 280),
      makeBilliardBall('y1', 'yellow', midX, 220)
    ],
    pockets: [
      makeBilliardBall('r1', 'red', 90, 150),
      makeBilliardBall('r2', 'red', CANVAS_WIDTH - 90, 150),
      makeBilliardBall('y1', 'yellow', midX, 320)
    ],
    lane: [
      makeBilliardBall('r1', 'red', midX - 100, 200),
      makeBilliardBall('r2', 'red', midX + 100, 200),
      makeBilliardBall('y1', 'yellow', midX, 340)
    ],
    cage: [
      makeBilliardBall('r1', 'red', 120, 180),
      makeBilliardBall('r2', 'red', CANVAS_WIDTH - 120, 180),
      makeBilliardBall('y1', 'yellow', midX, 300)
    ],
    bank: [
      makeBilliardBall('r1', 'red', midX - 50, 170),
      makeBilliardBall('r2', 'red', midX + 60, 260),
      makeBilliardBall('y1', 'yellow', midX - 20, 360)
    ]
  };
  return layouts[pattern] ?? layouts.cushion;
}

/**
 * 이동 공 보너스 — 처음부터 순찰하는 목표 공 3개.
 * 빨강1 좌우 · 빨강2 대각 · 노랑 상하.
 */
export function createMovingObjectBalls(_stage = 1): BilliardBall[] {
  const midX = CANVAS_WIDTH / 2;
  const s = MOVERS_BALL_SPEED;
  const r1 = makeBilliardBall('m-r1', 'red', midX - 90, 180);
  const r2 = makeBilliardBall('m-r2', 'red', midX + 100, 260);
  const y1 = makeBilliardBall('m-y1', 'yellow', midX, 320);
  return [
    { ...r1, vx: s, vy: 0 },
    { ...r2, vx: s * 0.75, vy: s * 0.75 },
    { ...y1, vx: 0, vy: s }
  ];
}

/**
 * 이동 목표공 한 스텝 — 쿠션 반사 후 속도 크기 유지(멈추지 않음).
 */
export function stepMovingObject(ball: BilliardBall, speed = MOVERS_BALL_SPEED): BilliardBall {
  let next = moveBilliardObject(ball);
  const wall = handleEnclosedCushionCollision(next);
  next = wall.ball;
  const mag = Math.hypot(next.vx, next.vy);
  if (mag < 0.01) {
    return { ...next, vx: speed, vy: 0 };
  }
  const scale = speed / mag;
  return { ...next, vx: next.vx * scale, vy: next.vy * scale };
}

/** 이동 공 클리어 — 쿠션 조건 없이 전부 적중 */
export function isMoversClear(objects: BilliardBall[]): boolean {
  return objects.length > 0 && objects.every((b) => b.hit);
}

export function createBilliardCueBall(paddle: Paddle, speed: number, angleDeg: number): Ball {
  return createAimedBall(paddle, speed, angleDeg);
}

/**
 * 사방 쿠션 반사. 바닥도 쿠션 — 공 무한 생존.
 */
export function handleEnclosedCushionCollision<T extends { x: number; y: number; vx: number; vy: number; radius: number }>(
  ball: T
): { ball: T; cushionHit: boolean } {
  let { x, y, vx, vy } = ball;
  const r = ball.radius;
  let cushionHit = false;

  if (x - r <= 0) {
    x = r;
    if (vx < 0) cushionHit = true;
    vx = Math.abs(vx);
  } else if (x + r >= CANVAS_WIDTH) {
    x = CANVAS_WIDTH - r;
    if (vx > 0) cushionHit = true;
    vx = -Math.abs(vx);
  }
  if (y - r <= BILLIARD_TABLE_TOP) {
    y = BILLIARD_TABLE_TOP + r;
    if (vy < 0) cushionHit = true;
    vy = Math.abs(vy);
  } else if (y + r >= BILLIARD_TABLE_BOTTOM) {
    y = BILLIARD_TABLE_BOTTOM - r;
    if (vy > 0) cushionHit = true;
    vy = -Math.abs(vy);
  }

  return { ball: { ...ball, x, y, vx, vy }, cushionHit };
}

/**
 * 상·좌·우 쿠션만. 바닥은 패들로 받음 (스핀샷).
 */
export function handleTopAndSideCushionCollision<T extends { x: number; y: number; vx: number; vy: number; radius: number }>(
  ball: T
): { ball: T; cushionHit: boolean } {
  let { x, y, vx, vy } = ball;
  const r = ball.radius;
  let cushionHit = false;

  if (x - r <= 0) {
    x = r;
    if (vx < 0) cushionHit = true;
    vx = Math.abs(vx);
  } else if (x + r >= CANVAS_WIDTH) {
    x = CANVAS_WIDTH - r;
    if (vx > 0) cushionHit = true;
    vx = -Math.abs(vx);
  }
  if (y - r <= BILLIARD_TABLE_TOP) {
    y = BILLIARD_TABLE_TOP + r;
    if (vy < 0) cushionHit = true;
    vy = Math.abs(vy);
  }

  return { ball: { ...ball, x, y, vx, vy }, cushionHit };
}

/** 패들 히트 위치(0=왼쪽~1=오른쪽) → 스핀 */
export function spinFromPaddleHitPos(hitPos: number): number {
  const t = Math.max(0, Math.min(1, hitPos));
  return clampSpin(Math.round((t - 0.5) * 2 * SPIN_MAX));
}

/** 흰공 ↔ 목표공 충돌. 맞으면 hit=true, 간단 탄성 분리 */
export function resolveCueObjectHit(
  cue: Ball,
  obj: BilliardBall
): { cue: Ball; obj: BilliardBall; scored: boolean } {
  if (obj.hit) return { cue, obj, scored: false };
  const dx = obj.x - cue.x;
  const dy = obj.y - cue.y;
  const dist = Math.hypot(dx, dy);
  const minDist = cue.radius + obj.radius;
  if (dist === 0 || dist >= minDist) return { cue, obj, scored: false };

  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minDist - dist;
  const cueNext: Ball = {
    ...cue,
    x: cue.x - nx * overlap * 0.55,
    y: cue.y - ny * overlap * 0.55,
    vx: cue.vx - nx * 1.2,
    vy: cue.vy - ny * 1.2
  };
  const speed = Math.hypot(cue.vx, cue.vy) || 4;
  const objNext: BilliardBall = {
    ...obj,
    hit: true,
    x: obj.x + nx * overlap * 0.45,
    y: obj.y + ny * overlap * 0.45,
    vx: nx * speed * 0.55,
    vy: ny * speed * 0.55
  };
  return { cue: cueNext, obj: objNext, scored: true };
}

export function moveBilliardObject(ball: BilliardBall): BilliardBall {
  return { ...ball, x: ball.x + ball.vx, y: ball.y + ball.vy };
}

/** 목표공끼리·벽 반사 (맞은 뒤 굴러감) */
export function stepBilliardObject(ball: BilliardBall): BilliardBall {
  if (!ball.hit && ball.vx === 0 && ball.vy === 0) return ball;
  let next = moveBilliardObject(ball);
  const wall = handleEnclosedCushionCollision(next);
  next = wall.ball;
  // 약한 마찰
  next = { ...next, vx: next.vx * 0.995, vy: next.vy * 0.995 };
  if (Math.hypot(next.vx, next.vy) < 0.15) {
    next = { ...next, vx: 0, vy: 0 };
  }
  return next;
}

export function countHitBilliardBalls(objects: BilliardBall[]): number {
  return objects.filter((b) => b.hit).length;
}

export function isBilliardClear(
  cushionCount: number,
  requiredCushions: number,
  objects: BilliardBall[]
): boolean {
  return (
    cushionCount >= requiredCushions &&
    objects.length > 0 &&
    objects.every((b) => b.hit)
  );
}

export function getBilliardTimeLeftMs(endsAt: number, now: number): number {
  return Math.max(0, endsAt - now);
}

// ——— 별 먹기 / 보석 배율 ———

export type BonusCollectibleKind = 'star' | 'gem' | 'coin';

export interface BonusCollectible {
  id: string;
  kind: BonusCollectibleKind;
  x: number;
  y: number;
  radius: number;
  collected: boolean;
  value: number;
}

export const STAR_RADIUS = 12;
export const GEM_RADIUS = 11;
export const COIN_RADIUS = 10;
export const STAR_BASE_SCORE = 80;
export const GEM_BASE_SCORE = 100;
export const COIN_BASE_SCORE = 60;
export const VAULT_TARGET_RADIUS = 18;
export const GOLDEN_MAX_ATTEMPTS = 1;

/** 쿠션 횟수 → 보석 점수 배율 */
export function getCushionMultiplier(cushions: number): number {
  if (cushions <= 1) return 1;
  if (cushions === 2) return 2;
  if (cushions === 3) return 4;
  if (cushions === 4) return 8;
  return 16;
}

function makeCollectible(
  id: string,
  kind: BonusCollectibleKind,
  x: number,
  y: number,
  value: number
): BonusCollectible {
  return {
    id,
    kind,
    x,
    y,
    radius: kind === 'star' ? STAR_RADIUS : kind === 'gem' ? GEM_RADIUS : COIN_RADIUS,
    collected: false,
    value
  };
}

/** 별 배치 — 스테이지 높을수록 개수↑ */
export function createStarCollectibles(stage: number): BonusCollectible[] {
  const midX = CANVAS_WIDTH / 2;
  const hard = stage >= 35;
  const points: Array<[number, number]> = hard
    ? [
        [midX - 120, 140],
        [midX + 120, 140],
        [midX, 200],
        [midX - 90, 280],
        [midX + 90, 280],
        [midX - 40, 360],
        [midX + 40, 360]
      ]
    : [
        [midX, 150],
        [midX - 100, 230],
        [midX + 100, 230],
        [midX - 60, 330],
        [midX + 60, 330]
      ];
  return points.map(([x, y], i) => makeCollectible(`star-${i}`, 'star', x, y, STAR_BASE_SCORE));
}

/**
 * 별 소나기 — 위에서 떨어지는 별.
 */
export interface FallingStar {
  id: string;
  x: number;
  y: number;
  vy: number;
  /** 철 블록 튕김용 가로 속도 */
  vx: number;
  radius: number;
  value: number;
}

/** 떨어지는 별 1개 생성 */
export function createFallingStar(seq: number, rng = Math.random): FallingStar {
  const margin = 28;
  const speedSpan = STAR_RAIN_FALL_MAX - STAR_RAIN_FALL_MIN;
  return {
    id: `rain-${seq}`,
    x: margin + rng() * (CANVAS_WIDTH - margin * 2),
    y: BILLIARD_TABLE_TOP + 8 + rng() * 36,
    vy: STAR_RAIN_FALL_MIN + rng() * speedSpan,
    vx: 0,
    radius: STAR_RADIUS,
    value: STAR_BASE_SCORE
  };
}

export function shouldSpawnStarRain(
  lastSpawnAt: number,
  now: number,
  activeCount: number,
  intervalMs = STAR_RAIN_SPAWN_INTERVAL_MS,
  maxActive = STAR_RAIN_MAX_ACTIVE
): boolean {
  if (activeCount >= maxActive) return false;
  return now - lastSpawnAt >= intervalMs;
}

/** 별 낙하 + 약한 중력. 화면 아래 벗어나면 제거 */
export function stepFallingStars(stars: FallingStar[]): FallingStar[] {
  return stars
    .map((s) => {
      let vx = s.vx;
      let x = s.x + vx;
      if (x - s.radius < 0) {
        x = s.radius;
        vx = Math.abs(vx);
      } else if (x + s.radius > CANVAS_WIDTH) {
        x = CANVAS_WIDTH - s.radius;
        vx = -Math.abs(vx);
      }
      return {
        ...s,
        x,
        y: s.y + s.vy,
        vx: vx * 0.98,
        vy: s.vy + (s.vy < 0 ? 0.22 : 0.04)
      };
    })
    .filter((s) => s.y - s.radius < CANVAS_HEIGHT + 24);
}

/** @deprecated 공 수집 — 패들 수집 사용 */
export function tryCollectFallingStar(ball: Ball, star: FallingStar): boolean {
  return Math.hypot(star.x - ball.x, star.y - ball.y) < ball.radius + star.radius;
}

/** 패들로 별 먹기 */
export function tryCollectFallingStarWithPaddle(paddle: Paddle, star: FallingStar): boolean {
  return circleRectCollision(
    star.x,
    star.y,
    star.radius,
    paddle.x,
    paddle.y,
    paddle.width,
    paddle.height
  );
}

/**
 * 별은 철에 안 막힘(통과). 공만 철에 튕김 — 갇힘 방지.
 */
export function bounceFallingStarOffIron(star: FallingStar, _bricks: Brick[]): FallingStar {
  return star;
}

/** 별 소나기용 중간 철 블록 (별이 떨어질 틈 있음) */
export function createStarRainIronBricks(): Brick[] {
  const brickWidth =
    (CANVAS_WIDTH - BRICK_OFFSET_LEFT * 2 - BRICK_PADDING * (BRICK_COLS - 1)) / BRICK_COLS;
  const brickHeight = 22;
  const makeIron = (row: number, col: number): Brick => ({
    x: BRICK_OFFSET_LEFT + col * (brickWidth + BRICK_PADDING),
    y: BRICK_OFFSET_TOP + row * (brickHeight + BRICK_PADDING) + 40,
    width: brickWidth,
    height: brickHeight,
    type: 'iron',
    hits: 0,
    maxHits: 999,
    alive: true,
    color: BRICK_COLORS.iron,
    points: 0
  });
  // 철 2개 — 좌·우 살짝 어긋난 위치
  return [makeIron(3, 2), makeIron(4, 6)];
}

/**
 * @deprecated 정적 배치 — 별 소나기로 대체
 */
export function createSpinCollectibles(stage: number): BonusCollectible[] {
  const midX = CANVAS_WIDTH / 2;
  const hard = stage >= 45;
  const points: Array<[number, number]> = hard
    ? [
        [midX, 120],
        [48, 220],
        [CANVAS_WIDTH - 48, 220],
        [48, 380],
        [CANVAS_WIDTH - 48, 380],
        [midX, 340]
      ]
    : [
        [midX, 130],
        [52, 250],
        [CANVAS_WIDTH - 52, 250],
        [midX, 360]
      ];
  return points.map(([x, y], i) => makeCollectible(`spin-${i}`, 'star', x, y, STAR_BASE_SCORE));
}

/** 보석 배치 */
export function createGemCollectibles(stage: number): BonusCollectible[] {
  const midX = CANVAS_WIDTH / 2;
  const hard = stage >= 45;
  const points: Array<[number, number]> = hard
    ? [
        [midX - 110, 160],
        [midX + 110, 160],
        [midX, 240],
        [midX - 70, 320],
        [midX + 70, 320],
        [midX, 400]
      ]
    : [
        [midX - 90, 170],
        [midX + 90, 170],
        [midX, 260],
        [midX - 50, 360],
        [midX + 50, 360]
      ];
  return points.map(([x, y], i) => makeCollectible(`gem-${i}`, 'gem', x, y, GEM_BASE_SCORE));
}

export function tryCollectItem(
  cue: Ball,
  item: BonusCollectible
): { item: BonusCollectible; collected: boolean } {
  if (item.collected) return { item, collected: false };
  const dist = Math.hypot(item.x - cue.x, item.y - cue.y);
  if (dist >= cue.radius + item.radius) return { item, collected: false };
  return { item: { ...item, collected: true }, collected: true };
}

export function countCollectedItems(items: BonusCollectible[]): number {
  return items.filter((i) => i.collected).length;
}

export function isCollectibleClear(items: BonusCollectible[]): boolean {
  return items.length > 0 && items.every((i) => i.collected);
}

/** 보석 획득 점수 = 기본 × 스테이지 × 쿠션배율 */
export function getGemPickupScore(baseValue: number, stage: number, cushions: number): number {
  return baseValue * stage * getCushionMultiplier(cushions);
}

export function getStarPickupScore(baseValue: number, stage: number): number {
  return baseValue * stage;
}

export function getCoinPickupScore(baseValue: number, stage: number, cushions: number): number {
  return baseValue * stage * getCushionMultiplier(Math.max(1, cushions));
}

/** 골든샷용 코인 배치 */
export function createCoinCollectibles(stage: number): BonusCollectible[] {
  const midX = CANVAS_WIDTH / 2;
  const points: Array<[number, number]> = [
    [midX - 100, 150],
    [midX + 100, 150],
    [midX, 220],
    [midX - 120, 300],
    [midX + 120, 300],
    [midX - 50, 380],
    [midX + 50, 380],
    [midX, 450]
  ];
  return points.map(([x, y], i) => makeCollectible(`coin-${i}`, 'coin', x, y, COIN_BASE_SCORE));
}

// ——— 금고 열기 (순서 퍼즐) ———

export interface VaultTarget {
  id: string;
  number: number;
  x: number;
  y: number;
  radius: number;
  /** 올바른 순서로 이미 맞췄는지 */
  activated: boolean;
}

export interface VaultPuzzle {
  targets: VaultTarget[];
  /** 맞춰야 하는 번호 순서 */
  sequence: number[];
}

/** 금고 원샷 권장 조준각 — 좌→상→우 뱅크 경로 */
export const VAULT_AIM_ANGLE = 130;

/** 스테이지별 금고 — 원샷 뱅크샷 경로(조준 130°)에 맞춘 배치 */
export function createVaultPuzzle(stage: number): VaultPuzzle {
  const hard = stage >= 45;
  const sequence = hard ? [1, 2, 3, 4] : [1, 2, 3];
  // aim 130° 쿠션 히트: L(8,310) → T(224,56) → R(472,355) → B(260,604)
  const positions: Record<number, [number, number]> = hard
    ? {
        1: [28, 310],
        2: [224, 72],
        3: [452, 355],
        4: [366, 480]
      }
    : {
        1: [28, 310],
        2: [224, 72],
        3: [452, 355]
      };
  const radius = VAULT_TARGET_RADIUS + (hard ? 2 : 6);
  const targets: VaultTarget[] = sequence.map((n) => ({
    id: `vault-${n}`,
    number: n,
    x: positions[n][0],
    y: positions[n][1],
    radius,
    activated: false
  }));
  return { targets, sequence };
}

export interface VaultHitResult {
  targets: VaultTarget[];
  sequenceIndex: number;
  correct: boolean;
  complete: boolean;
  wrong: boolean;
}

/**
 * 금고 타깃 히트. 다음 순서 번호만 인정. 틀린 번호면 wrong=true (원샷 실패).
 */
export function resolveVaultHit(
  targets: VaultTarget[],
  sequence: number[],
  sequenceIndex: number,
  cue: Ball
): VaultHitResult {
  let hitNumber: number | null = null;
  for (const t of targets) {
    if (t.activated) continue;
    const dist = Math.hypot(t.x - cue.x, t.y - cue.y);
    if (dist < cue.radius + t.radius) {
      hitNumber = t.number;
      break;
    }
  }
  if (hitNumber == null) {
    return { targets, sequenceIndex, correct: false, complete: false, wrong: false };
  }

  const expected = sequence[sequenceIndex];
  if (hitNumber !== expected) {
    return {
      targets,
      sequenceIndex,
      correct: false,
      complete: false,
      wrong: true
    };
  }

  const nextTargets = targets.map((t) =>
    t.number === hitNumber ? { ...t, activated: true } : t
  );
  const nextIndex = sequenceIndex + 1;
  return {
    targets: nextTargets,
    sequenceIndex: nextIndex,
    correct: true,
    complete: nextIndex >= sequence.length,
    wrong: false
  };
}

export function getBonusAttemptLimit(challenge: BonusChallengeType): number {
  return challenge === 'golden' || challenge === 'spin' ? GOLDEN_MAX_ATTEMPTS : BONUS_MAX_ATTEMPTS;
}

export function movePaddle(paddle: Paddle, dx: number): Paddle {
  let nextX = paddle.x + dx;
  nextX = Math.max(0, Math.min(CANVAS_WIDTH - paddle.width, nextX));
  return { ...paddle, x: nextX };
}

export function resizePaddle(paddle: Paddle, width: number): Paddle {
  const center = paddle.x + paddle.width / 2;
  const nextWidth = Math.max(40, Math.min(CANVAS_WIDTH * 0.75, width));
  let x = center - nextWidth / 2;
  x = Math.max(0, Math.min(CANVAS_WIDTH - nextWidth, x));
  return { ...paddle, width: nextWidth, x };
}

export function moveBall(ball: Ball): Ball {
  return { ...ball, x: ball.x + ball.vx, y: ball.y + ball.vy };
}

export function handleWallCollision(ball: Ball): Ball {
  let { x, y, vx, vy } = ball;
  if (x - ball.radius <= 0) {
    x = ball.radius;
    vx = Math.abs(vx);
  } else if (x + ball.radius >= CANVAS_WIDTH) {
    x = CANVAS_WIDTH - ball.radius;
    vx = -Math.abs(vx);
  }
  if (y - ball.radius <= 0) {
    y = ball.radius;
    vy = Math.abs(vy);
  }
  return { ...ball, x, y, vx, vy };
}

export function isBallLost(ball: Ball): boolean {
  return ball.y - ball.radius > CANVAS_HEIGHT;
}

export function circleRectCollision(
  cx: number,
  cy: number,
  radius: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): boolean {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < radius * radius;
}

export interface PaddleCollisionResult {
  ball: Ball;
  hit: boolean;
}

/** 패들 충돌 — 맞는 위치에 따라 반사각 변화. impartSpin 시 스핀도 부여 */
export function handlePaddleCollision(
  ball: Ball,
  paddle: Paddle,
  options?: { impartSpin?: boolean }
): PaddleCollisionResult {
  if (
    !circleRectCollision(ball.x, ball.y, ball.radius, paddle.x, paddle.y, paddle.width, paddle.height)
  ) {
    return { ball, hit: false };
  }
  if (ball.vy <= 0) return { ball, hit: false };

  const hitPos = (ball.x - paddle.x) / paddle.width;
  const angle = (hitPos - 0.5) * Math.PI * 0.7;
  const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
  const newVx = speed * Math.sin(angle);
  const newVy = -Math.abs(speed * Math.cos(angle));

  const next: Ball = {
    ...ball,
    y: paddle.y - ball.radius - 1,
    vx: newVx,
    vy: newVy
  };
  if (options?.impartSpin) {
    next.spin = spinFromPaddleHitPos(hitPos);
  }

  return { ball: next, hit: true };
}

export function bounceBallFromBrick(ball: Ball, brick: Brick): Ball {
  const overlapLeft = ball.x + ball.radius - brick.x;
  const overlapRight = brick.x + brick.width - (ball.x - ball.radius);
  const overlapTop = ball.y + ball.radius - brick.y;
  const overlapBottom = brick.y + brick.height - (ball.y - ball.radius);
  const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

  let vx = ball.vx;
  let vy = ball.vy;
  if (minOverlap === overlapLeft || minOverlap === overlapRight) vx = -vx;
  else vy = -vy;
  return { ...ball, vx, vy };
}

export interface BrickDestroyResult {
  bricks: Brick[];
  destroyed: Brick[];
  scoreGained: number;
}

/** 블록 1개에 데미지 + 폭발/연쇄 처리 */
export function damageBrickAt(
  bricks: Brick[],
  index: number,
  stage: number,
  chainExplosion = true,
  instant = false
): BrickDestroyResult {
  const brick = bricks[index];
  if (!brick?.alive) return { bricks, destroyed: [], scoreGained: 0 };
  if (brick.type === 'iron') return { bricks, destroyed: [], scoreGained: 0 };

  const hits = instant ? brick.maxHits : brick.hits + 1;
  const survived = hits < brick.maxHits;
  let nextBricks = bricks.map((b, idx) => {
    if (idx !== index) return b;
    if (survived) {
      return { ...b, hits, color: b.type === 'strong' ? '#ffab91' : b.color };
    }
    return { ...b, hits, alive: false };
  });

  if (survived) return { bricks: nextBricks, destroyed: [], scoreGained: 0 };

  const destroyed = [{ ...brick, hits, alive: false }];
  let scoreGained = brick.points * stage;

  if (chainExplosion && brick.type === 'explosive') {
    const chain = destroyAdjacentBricks(nextBricks, index, stage);
    nextBricks = chain.bricks;
    destroyed.push(...chain.destroyed);
    scoreGained += chain.scoreGained;
  }

  return { bricks: nextBricks, destroyed, scoreGained };
}

/** 폭발 블록 주변 파괴 */
export function destroyAdjacentBricks(
  bricks: Brick[],
  originIndex: number,
  stage: number
): BrickDestroyResult {
  const origin = bricks[originIndex];
  if (!origin) return { bricks, destroyed: [], scoreGained: 0 };

  const neighbors = findAdjacentBrickIndices(bricks, origin);
  let nextBricks = bricks;
  const destroyed: Brick[] = [];
  let scoreGained = 0;

  for (const idx of neighbors) {
    const target = nextBricks[idx];
    if (!target?.alive || target.type === 'iron') continue;
    const result = damageBrickAt(nextBricks, idx, stage, false);
    nextBricks = result.bricks;
    destroyed.push(...result.destroyed);
    scoreGained += result.scoreGained;
  }

  return { bricks: nextBricks, destroyed, scoreGained };
}

/** 격자 인접 블록 인덱스 */
export function findAdjacentBrickIndices(bricks: Brick[], origin: Brick): number[] {
  const indices: number[] = [];
  for (let i = 0; i < bricks.length; i++) {
    const other = bricks[i];
    if (!other.alive || other === origin) continue;
    const horizontalTouch =
      Math.abs(other.x - (origin.x + origin.width)) <= BRICK_PADDING + 1 ||
      Math.abs(origin.x - (other.x + other.width)) <= BRICK_PADDING + 1;
    const verticalTouch =
      Math.abs(other.y - (origin.y + origin.height)) <= BRICK_PADDING + 1 ||
      Math.abs(origin.y - (other.y + other.height)) <= BRICK_PADDING + 1;
    const overlapX = origin.x < other.x + other.width && origin.x + origin.width > other.x;
    const overlapY = origin.y < other.y + other.height && origin.y + origin.height > other.y;
    if ((horizontalTouch && overlapY) || (verticalTouch && overlapX)) indices.push(i);
  }
  return indices;
}

export interface BrickCollisionResult {
  ball: Ball;
  bricks: Brick[];
  scoreGained: number;
  hit: boolean;
  destroyedBricks: Brick[];
}

/** 블록 충돌 */
export function handleBrickCollision(
  ball: Ball,
  bricks: Brick[],
  stage: number
): BrickCollisionResult {
  for (let i = 0; i < bricks.length; i++) {
    const brick = bricks[i];
    if (!brick.alive) continue;
    if (
      !circleRectCollision(ball.x, ball.y, ball.radius, brick.x, brick.y, brick.width, brick.height)
    ) {
      continue;
    }

    const bounced = bounceBallFromBrick(ball, brick);
    if (brick.type === 'iron') {
      return { ball: bounced, bricks, scoreGained: 0, hit: true, destroyedBricks: [] };
    }

    const damage = damageBrickAt(bricks, i, stage, true);
    return {
      ball: bounced,
      bricks: damage.bricks,
      scoreGained: damage.scoreGained,
      hit: true,
      destroyedBricks: damage.destroyed
    };
  }
  return { ball, bricks, scoreGained: 0, hit: false, destroyedBricks: [] };
}

export interface InvincibleBrickCollisionResult {
  ball: Ball;
  bricks: Brick[];
  scoreGained: number;
  destroyedBricks: Brick[];
}

/** 무적공 — 관통 파괴 (철 블록 제외) */
export function handleInvincibleBrickCollision(
  ball: Ball,
  bricks: Brick[],
  stage: number
): InvincibleBrickCollisionResult {
  let nextBricks = bricks;
  let scoreGained = 0;
  const destroyedBricks: Brick[] = [];

  for (let i = 0; i < nextBricks.length; i++) {
    const brick = nextBricks[i];
    if (!brick.alive || brick.type === 'iron') continue;
    if (
      !circleRectCollision(ball.x, ball.y, ball.radius, brick.x, brick.y, brick.width, brick.height)
    ) {
      continue;
    }
    const damage = damageBrickAt(nextBricks, i, stage, true, true);
    nextBricks = damage.bricks;
    destroyedBricks.push(...damage.destroyed);
    scoreGained += damage.scoreGained;
  }

  return { ball, bricks: nextBricks, scoreGained, destroyedBricks };
}

export function isInvincibleBallActive(effects: ActiveEffects, now: number): boolean {
  return effects.invincibleBallUntil > now;
}

export function isLaserActive(effects: ActiveEffects, now: number): boolean {
  return effects.laserUntil > now;
}

export function calculateComboBonus(combo: number, baseScore: number): number {
  if (combo <= 1) return baseScore;
  return baseScore + Math.floor(baseScore * 0.25 * (combo - 1));
}

/**
 * 스테이지 클리어 보너스.
 * 보너스는 attemptsUsed=1(첫 발)일 때 2배, 2발째는 기본.
 */
export function getStageClearBonus(stage: number, bonusAttemptsUsed = 1): number {
  const base = 500 + stage * 250;
  if (getStageKind(stage) !== 'bonus') return base;
  return base * getBonusShotClearMultiplier(bonusAttemptsUsed);
}

/** 전체 폭파 — 철 블록 제외 */
export function destroyAllBreakableBricks(bricks: Brick[], stage: number): BrickDestroyResult {
  let nextBricks = bricks;
  const destroyed: Brick[] = [];
  let scoreGained = 0;

  for (let i = 0; i < nextBricks.length; i++) {
    const brick = nextBricks[i];
    if (!isDestroyableBrick(brick)) continue;
    const damage = damageBrickAt(nextBricks, i, stage, true, true);
    nextBricks = damage.bricks;
    destroyed.push(...damage.destroyed);
    scoreGained += damage.scoreGained;
  }

  return { bricks: nextBricks, destroyed, scoreGained };
}

export function normalizeBallSpeed(ball: Ball, targetSpeed: number): Ball {
  const current = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
  if (current < 0.01) return ball;
  const scale = targetSpeed / current;
  return { ...ball, vx: ball.vx * scale, vy: ball.vy * scale };
}

export function shouldDropPowerUp(brick: Brick, stage?: number): boolean {
  if (brick.type === 'rainbow') return true;
  const chance = POWER_UP_DROP_CHANCE[brick.type];
  const multiplier =
    stage != null && getStageKind(stage) === 'bonus' ? BONUS_DROP_CHANCE_MULTIPLIER : 1;
  return Math.random() < Math.min(1, chance * multiplier);
}

export function pickPowerUpType(brickType: BrickType): PowerUpType {
  if (brickType === 'rainbow') {
    return RAINBOW_POWER_UPS[Math.floor(Math.random() * RAINBOW_POWER_UPS.length)];
  }
  const goodChance = brickType === 'strong' ? 0.62 : 0.5;
  const pool = Math.random() < goodChance ? GOOD_POWER_UPS : BAD_POWER_UPS;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function createPowerUpDrop(brick: Brick, type: PowerUpType): PowerUp {
  powerUpIdCounter += 1;
  return {
    id: `pu-${powerUpIdCounter}`,
    type,
    x: brick.x + brick.width / 2 - POWER_UP_SIZE / 2,
    y: brick.y + brick.height,
    width: POWER_UP_SIZE,
    height: POWER_UP_SIZE,
    vy: POWER_UP_FALL_SPEED,
    alive: true
  };
}

export function movePowerUps(powerUps: PowerUp[]): PowerUp[] {
  return powerUps
    .filter((pu) => pu.alive)
    .map((pu) => ({ ...pu, y: pu.y + pu.vy }))
    .filter((pu) => pu.y < CANVAS_HEIGHT + POWER_UP_SIZE);
}

export interface PowerUpCollectResult {
  powerUps: PowerUp[];
  collected: PowerUp[];
}

export function handlePowerUpPaddleCollision(
  powerUps: PowerUp[],
  paddle: Paddle
): PowerUpCollectResult {
  const collected: PowerUp[] = [];
  const next = powerUps.map((pu) => {
    if (!pu.alive) return pu;
    const cx = pu.x + pu.width / 2;
    const cy = pu.y + pu.height / 2;
    const hit = circleRectCollision(
      cx,
      cy,
      pu.width / 2,
      paddle.x,
      paddle.y,
      paddle.width,
      paddle.height
    );
    if (!hit) return pu;
    collected.push(pu);
    return { ...pu, alive: false };
  });
  return { powerUps: next, collected };
}

export function createLaserShot(paddle: Paddle): Laser {
  laserIdCounter += 1;
  return {
    id: `laser-${laserIdCounter}`,
    x: paddle.x + paddle.width / 2,
    y: paddle.y - 4,
    vy: -LASER_SPEED,
    alive: true
  };
}

export function moveLasers(lasers: Laser[]): Laser[] {
  return lasers
    .filter((l) => l.alive)
    .map((l) => ({ ...l, y: l.y + l.vy }))
    .filter((l) => l.y > -20);
}

export interface LaserCollisionResult {
  lasers: Laser[];
  bricks: Brick[];
  scoreGained: number;
  destroyedBricks: Brick[];
}

/** 레이저와 블록 충돌. 철은 파괴 안 되고 레이저만 막힘 */
export function handleLaserBrickCollision(
  lasers: Laser[],
  bricks: Brick[],
  stage: number
): LaserCollisionResult {
  let nextBricks = bricks;
  let nextLasers = lasers;
  let scoreGained = 0;
  const destroyedBricks: Brick[] = [];

  for (let li = 0; li < nextLasers.length; li++) {
    const laser = nextLasers[li];
    if (!laser.alive) continue;

    for (let bi = 0; bi < nextBricks.length; bi++) {
      const brick = nextBricks[bi];
      if (!brick.alive) continue;
      if (
        !circleRectCollision(laser.x, laser.y, 3, brick.x, brick.y, brick.width, brick.height)
      ) {
        continue;
      }
      // 철: 레이저 소멸만 (관통 금지)
      if (brick.type === 'iron') {
        nextLasers = nextLasers.map((l, idx) => (idx === li ? { ...l, alive: false } : l));
        break;
      }
      const damage = damageBrickAt(nextBricks, bi, stage, true);
      nextBricks = damage.bricks;
      destroyedBricks.push(...damage.destroyed);
      scoreGained += damage.scoreGained;
      nextLasers = nextLasers.map((l, idx) => (idx === li ? { ...l, alive: false } : l));
      break;
    }
  }

  return { lasers: nextLasers, bricks: nextBricks, scoreGained, destroyedBricks };
}

export function getEffectivePaddleWidth(effects: ActiveEffects, now: number): number {
  if (effects.expandPaddleUntil > now) return PADDLE_WIDTH * PADDLE_EXPAND_MULTIPLIER;
  if (effects.shrinkPaddleUntil > now) return PADDLE_WIDTH * PADDLE_SHRINK_MULTIPLIER;
  return PADDLE_WIDTH;
}

export function getEffectiveBallSpeed(
  baseSpeed: number,
  effects: ActiveEffects,
  now: number
): number {
  if (effects.fastBallsUntil > now) return baseSpeed * FAST_BALL_SPEED_RATIO;
  if (effects.slowBallsUntil > now) return baseSpeed * SLOW_BALL_SPEED_RATIO;
  return baseSpeed;
}

export function applyTimedPowerUp(
  type: PowerUpType,
  effects: ActiveEffects,
  now: number
): ActiveEffects {
  const duration = POWER_UP_META[type].durationMs;
  if (!duration) return effects;

  const next = { ...effects };
  switch (type) {
    case 'expand':
      next.expandPaddleUntil = now + duration;
      next.shrinkPaddleUntil = 0;
      break;
    case 'shrink':
      next.shrinkPaddleUntil = now + duration;
      next.expandPaddleUntil = 0;
      break;
    case 'slow':
      next.slowBallsUntil = now + duration;
      next.fastBallsUntil = 0;
      break;
    case 'fast':
      next.fastBallsUntil = now + duration;
      next.slowBallsUntil = 0;
      break;
    case 'invincible':
      next.invincibleBallUntil = now + duration;
      break;
    case 'laser':
      next.laserUntil = now + duration;
      break;
    default:
      break;
  }
  return next;
}

export function createMultiballBalls(sourceBall: Ball, speed: number): Ball[] {
  const baseAngle = Math.atan2(sourceBall.vy, sourceBall.vx);
  const offsets = [-0.45, 0, 0.45];
  return offsets.map((offset) => {
    const angle = baseAngle + offset;
    return {
      ...sourceBall,
      vx: speed * Math.cos(angle),
      vy: speed * Math.sin(angle)
    };
  });
}

export function getActiveEffectLabels(
  effects: ActiveEffects,
  now: number,
  shieldCharges = 0
): string[] {
  const labels: string[] = [];
  if (shieldCharges > 0) labels.push(`보호막 x${shieldCharges}`);
  if (effects.expandPaddleUntil > now) labels.push(`확대 ${Math.ceil((effects.expandPaddleUntil - now) / 1000)}s`);
  if (effects.shrinkPaddleUntil > now) labels.push(`축소 ${Math.ceil((effects.shrinkPaddleUntil - now) / 1000)}s`);
  if (effects.slowBallsUntil > now) labels.push(`슬로우 ${Math.ceil((effects.slowBallsUntil - now) / 1000)}s`);
  if (effects.fastBallsUntil > now) labels.push(`가속 ${Math.ceil((effects.fastBallsUntil - now) / 1000)}s`);
  if (effects.invincibleBallUntil > now) labels.push(`무적공 ${Math.ceil((effects.invincibleBallUntil - now) / 1000)}s`);
  if (effects.laserUntil > now) labels.push(`레이저 ${Math.ceil((effects.laserUntil - now) / 1000)}s`);
  return labels;
}

export function normalizeAllBallSpeeds(balls: Ball[], targetSpeed: number): Ball[] {
  return balls.map((ball) => normalizeBallSpeed(ball, targetSpeed));
}

/** 파괴 블록에서 아이템 드롭 생성 */
export function createDropsFromDestroyedBricks(
  destroyedBricks: Brick[],
  stage?: number
): { brick: Brick; type: PowerUpType }[] {
  const drops: { brick: Brick; type: PowerUpType }[] = [];
  for (const brick of destroyedBricks) {
    if (!shouldDropPowerUp(brick, stage)) continue;
    drops.push({ brick, type: pickPowerUpType(brick.type) });
  }
  return drops;
}

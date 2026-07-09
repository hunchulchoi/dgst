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
  | 'ready';

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

export interface StageConfig {
  stage: number;
  label: string;
  ballSpeed: number;
  strongRatio: number;
  explosiveRatio: number;
  ironRatio: number;
  rainbowRatio: number;
}

export const STAGES: StageConfig[] = [
  { stage: 1, label: '입문', ballSpeed: 5, strongRatio: 0.08, explosiveRatio: 0.05, ironRatio: 0, rainbowRatio: 0.03 },
  { stage: 2, label: '초급', ballSpeed: 5.5, strongRatio: 0.12, explosiveRatio: 0.08, ironRatio: 0.03, rainbowRatio: 0.03 },
  { stage: 3, label: '중급', ballSpeed: 6, strongRatio: 0.18, explosiveRatio: 0.1, ironRatio: 0.05, rainbowRatio: 0.04 },
  { stage: 4, label: '숙련', ballSpeed: 6.5, strongRatio: 0.22, explosiveRatio: 0.12, ironRatio: 0.06, rainbowRatio: 0.04 },
  { stage: 5, label: '고급', ballSpeed: 7, strongRatio: 0.28, explosiveRatio: 0.14, ironRatio: 0.08, rainbowRatio: 0.05 },
  { stage: 6, label: '전문', ballSpeed: 7.5, strongRatio: 0.32, explosiveRatio: 0.15, ironRatio: 0.09, rainbowRatio: 0.05 },
  { stage: 7, label: '달인', ballSpeed: 8, strongRatio: 0.36, explosiveRatio: 0.16, ironRatio: 0.1, rainbowRatio: 0.05 },
  { stage: 8, label: '마스터', ballSpeed: 8.5, strongRatio: 0.4, explosiveRatio: 0.18, ironRatio: 0.12, rainbowRatio: 0.04 },
  { stage: 9, label: '챔피언', ballSpeed: 9, strongRatio: 0.44, explosiveRatio: 0.18, ironRatio: 0.14, rainbowRatio: 0.04 },
  { stage: 10, label: '최종', ballSpeed: 9.5, strongRatio: 0.48, explosiveRatio: 0.2, ironRatio: 0.16, rainbowRatio: 0.03 }
];

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

/** 스테이지별 블록 생성 */
export function createBricks(stage: number): Brick[] {
  const config = getStageConfig(stage);
  const brickWidth =
    (CANVAS_WIDTH - BRICK_OFFSET_LEFT * 2 - BRICK_PADDING * (BRICK_COLS - 1)) / BRICK_COLS;
  const brickHeight = 22;
  const bricks: Brick[] = [];

  for (let row = 0; row < BRICK_ROWS; row++) {
    for (let col = 0; col < BRICK_COLS; col++) {
      const rand = Math.random();
      let type: BrickType = 'normal';
      let cursor = 0;

      cursor += config.rainbowRatio;
      if (rand < cursor) type = 'rainbow';
      else {
        cursor += config.ironRatio;
        if (rand < cursor) type = 'iron';
        else {
          cursor += config.explosiveRatio;
          if (rand < cursor) type = 'explosive';
          else {
            cursor += config.strongRatio;
            if (rand < cursor) type = 'strong';
          }
        }
      }

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

/** 패들 충돌 — 맞는 위치에 따라 반사각 변화 */
export function handlePaddleCollision(ball: Ball, paddle: Paddle): PaddleCollisionResult {
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

  return {
    ball: { ...ball, y: paddle.y - ball.radius - 1, vx: newVx, vy: newVy },
    hit: true
  };
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

export function getStageClearBonus(stage: number): number {
  return 500 + stage * 250;
}

/** 전체 폭파 — 철 블록 제외 */
export function destroyAllBreakableBricks(bricks: Brick[], stage: number): BrickDestroyResult {
  let nextBricks = bricks;
  const destroyed: Brick[] = [];
  let scoreGained = 0;

  for (let i = 0; i < nextBricks.length; i++) {
    const brick = nextBricks[i];
    if (!isDestroyableBrick(brick)) continue;
    const damage = damageBrickAt(nextBricks, i, stage, true);
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

export function shouldDropPowerUp(brick: Brick): boolean {
  if (brick.type === 'rainbow') return true;
  return Math.random() < POWER_UP_DROP_CHANCE[brick.type];
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

/** 레이저와 블록 충돌 */
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
      if (!brick.alive || brick.type === 'iron') continue;
      if (
        !circleRectCollision(laser.x, laser.y, 3, brick.x, brick.y, brick.width, brick.height)
      ) {
        continue;
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
  destroyedBricks: Brick[]
): { brick: Brick; type: PowerUpType }[] {
  const drops: { brick: Brick; type: PowerUpType }[] = [];
  for (const brick of destroyedBricks) {
    if (!shouldDropPowerUp(brick)) continue;
    drops.push({ brick, type: pickPowerUpType(brick.type) });
  }
  return drops;
}

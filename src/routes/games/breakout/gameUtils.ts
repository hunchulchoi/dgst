/** 블록깨기 게임 로직 */

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

export type BrickType = 'normal' | 'strong' | 'bonus';

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

export interface StageConfig {
  stage: number;
  label: string;
  ballSpeed: number;
  /** 0~1, 강화 블록 비율 */
  strongRatio: number;
  /** 0~1, 보너스 블록 비율 */
  bonusRatio: number;
}

export const STAGES: StageConfig[] = [
  { stage: 1, label: '입문', ballSpeed: 5, strongRatio: 0, bonusRatio: 0.1 },
  { stage: 2, label: '초급', ballSpeed: 5.5, strongRatio: 0.15, bonusRatio: 0.1 },
  { stage: 3, label: '중급', ballSpeed: 6, strongRatio: 0.25, bonusRatio: 0.08 },
  { stage: 4, label: '숙련', ballSpeed: 6.5, strongRatio: 0.35, bonusRatio: 0.08 },
  { stage: 5, label: '고급', ballSpeed: 7, strongRatio: 0.45, bonusRatio: 0.05 },
  { stage: 6, label: '전문', ballSpeed: 7.5, strongRatio: 0.5, bonusRatio: 0.05 },
  { stage: 7, label: '달인', ballSpeed: 8, strongRatio: 0.55, bonusRatio: 0.03 },
  { stage: 8, label: '마스터', ballSpeed: 8.5, strongRatio: 0.6, bonusRatio: 0.03 },
  { stage: 9, label: '챔피언', ballSpeed: 9, strongRatio: 0.65, bonusRatio: 0.02 },
  { stage: 10, label: '최종', ballSpeed: 9.5, strongRatio: 0.7, bonusRatio: 0.02 }
];

export const BRICK_COLORS: Record<BrickType, string> = {
  normal: '#4fc3f7',
  strong: '#ff7043',
  bonus: '#ffd54f'
};

const BRICK_POINTS: Record<BrickType, number> = {
  normal: 10,
  strong: 25,
  bonus: 50
};

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
      if (rand < config.bonusRatio) {
        type = 'bonus';
      } else if (rand < config.bonusRatio + config.strongRatio) {
        type = 'strong';
      }

      const maxHits = type === 'strong' ? 2 : 1;
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

/** 스테이지 설정 (1-based) */
export function getStageConfig(stage: number): StageConfig {
  const index = Math.min(Math.max(stage, 1), STAGES.length) - 1;
  return STAGES[index];
}

/** 전체 클리어 여부 */
export function isGameComplete(stage: number): boolean {
  return stage > STAGES.length;
}

/** 남은 블록 수 */
export function countAliveBricks(bricks: Brick[]): number {
  return bricks.filter((b) => b.alive).length;
}

/** 스테이지 클리어 여부 */
export function isStageClear(bricks: Brick[]): boolean {
  return countAliveBricks(bricks) === 0;
}

/** 초기 패들 */
export function createPaddle(): Paddle {
  return {
    x: (CANVAS_WIDTH - PADDLE_WIDTH) / 2,
    y: PADDLE_Y,
    width: PADDLE_WIDTH,
    height: PADDLE_HEIGHT
  };
}

/** 공 발사 (패들 위) */
export function createBall(paddle: Paddle, speed: number): Ball {
  return {
    x: paddle.x + paddle.width / 2,
    y: paddle.y - BALL_RADIUS - 2,
    vx: speed * (Math.random() > 0.5 ? 1 : -1) * 0.7,
    vy: -speed,
    radius: BALL_RADIUS
  };
}

/** 패들 이동 (경계 클램프) */
export function movePaddle(paddle: Paddle, dx: number): Paddle {
  let nextX = paddle.x + dx;
  nextX = Math.max(0, Math.min(CANVAS_WIDTH - paddle.width, nextX));
  return { ...paddle, x: nextX };
}

/** 공 이동 */
export function moveBall(ball: Ball): Ball {
  return {
    ...ball,
    x: ball.x + ball.vx,
    y: ball.y + ball.vy
  };
}

/** 벽 충돌 처리 */
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

/** 공이 바닥 아래로 떨어졌는지 */
export function isBallLost(ball: Ball): boolean {
  return ball.y - ball.radius > CANVAS_HEIGHT;
}

/** AABB 충돌 */
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

/** 패들 충돌 — 반사각은 맞은 위치에 따라 변화 */
export function handlePaddleCollision(ball: Ball, paddle: Paddle): PaddleCollisionResult {
  if (!circleRectCollision(ball.x, ball.y, ball.radius, paddle.x, paddle.y, paddle.width, paddle.height)) {
    return { ball, hit: false };
  }
  if (ball.vy <= 0) return { ball, hit: false };

  const hitPos = (ball.x - paddle.x) / paddle.width;
  const angle = (hitPos - 0.5) * Math.PI * 0.7;
  const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
  const newVx = speed * Math.sin(angle);
  const newVy = -Math.abs(speed * Math.cos(angle));

  return {
    ball: {
      ...ball,
      y: paddle.y - ball.radius - 1,
      vx: newVx,
      vy: newVy
    },
    hit: true
  };
}

export interface BrickCollisionResult {
  ball: Ball;
  bricks: Brick[];
  scoreGained: number;
  hit: boolean;
}

/** 블록 충돌 — 한 프레임에 하나만 처리 */
export function handleBrickCollision(ball: Ball, bricks: Brick[], stage: number): BrickCollisionResult {
  for (let i = 0; i < bricks.length; i++) {
    const brick = bricks[i];
    if (!brick.alive) continue;
    if (!circleRectCollision(ball.x, ball.y, ball.radius, brick.x, brick.y, brick.width, brick.height)) {
      continue;
    }

    const nextBricks = bricks.map((b, idx) => {
      if (idx !== i) return b;
      const hits = b.hits + 1;
      const alive = hits < b.maxHits;
      return { ...b, hits, alive, color: alive && b.type === 'strong' ? '#ffab91' : b.color };
    });

    const overlapLeft = ball.x + ball.radius - brick.x;
    const overlapRight = brick.x + brick.width - (ball.x - ball.radius);
    const overlapTop = ball.y + ball.radius - brick.y;
    const overlapBottom = brick.y + brick.height - (ball.y - ball.radius);
    const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

    let vx = ball.vx;
    let vy = ball.vy;
    if (minOverlap === overlapLeft || minOverlap === overlapRight) {
      vx = -vx;
    } else {
      vy = -vy;
    }

    const scoreGained = brick.points * stage;
    return {
      ball: { ...ball, vx, vy },
      bricks: nextBricks,
      scoreGained,
      hit: true
    };
  }
  return { ball, bricks, scoreGained: 0, hit: false };
}

/** 블록 파괴 점수 */
export function calculateBrickScore(brick: Brick, stage: number): number {
  return brick.points * stage;
}

/** 공 속도 정규화 (최소/최대 유지) */
export function normalizeBallSpeed(ball: Ball, targetSpeed: number): Ball {
  const current = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
  if (current < 0.01) return ball;
  const scale = targetSpeed / current;
  return { ...ball, vx: ball.vx * scale, vy: ball.vy * scale };
}

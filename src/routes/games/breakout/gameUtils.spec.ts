import { describe, expect, it } from 'vitest';
import {
  CANVAS_WIDTH,
  createBall,
  createBricks,
  createPaddle,
  getStageConfig,
  handleBrickCollision,
  handlePaddleCollision,
  handleWallCollision,
  isBallLost,
  isGameComplete,
  isStageClear,
  movePaddle,
  STAGES,
  type Ball,
  type Brick
} from './gameUtils';

describe('breakout gameUtils', () => {
  it('creates bricks for each stage', () => {
    for (const stage of STAGES) {
      const bricks = createBricks(stage.stage);
      expect(bricks.length).toBe(60);
      expect(bricks.every((b) => b.alive)).toBe(true);
    }
  });

  it('clamps paddle within canvas bounds', () => {
    const paddle = createPaddle();
    const left = movePaddle(paddle, -999);
    expect(left.x).toBe(0);
    const right = movePaddle(paddle, 999);
    expect(right.x).toBe(CANVAS_WIDTH - paddle.width);
  });

  it('bounces ball off left wall', () => {
    const ball: Ball = { x: 5, y: 100, vx: -3, vy: 2, radius: 8 };
    const bounced = handleWallCollision(ball);
    expect(bounced.vx).toBeGreaterThan(0);
    expect(bounced.x).toBeGreaterThanOrEqual(bounced.radius);
  });

  it('detects ball lost below canvas', () => {
    const ball: Ball = { x: 100, y: 700, vx: 0, vy: 5, radius: 8 };
    expect(isBallLost(ball)).toBe(true);
  });

  it('reflects ball off paddle', () => {
    const paddle = createPaddle();
    const ball: Ball = {
      x: paddle.x + paddle.width / 2,
      y: paddle.y - 5,
      vx: 2,
      vy: 3,
      radius: 8
    };
    const result = handlePaddleCollision(ball, paddle);
    expect(result.hit).toBe(true);
    expect(result.ball.vy).toBeLessThan(0);
  });

  it('destroys normal brick on hit', () => {
    const bricks = createBricks(1);
    const target = bricks[0];
    const ball: Ball = {
      x: target.x + target.width / 2,
      y: target.y + target.height + 5,
      vx: 0,
      vy: -4,
      radius: 8
    };
    const result = handleBrickCollision(ball, bricks, 1);
    expect(result.hit).toBe(true);
    expect(result.scoreGained).toBeGreaterThan(0);
    expect(result.bricks[0].alive).toBe(false);
  });

  it('requires two hits for strong brick', () => {
    const bricks: Brick[] = [
      {
        x: 100,
        y: 100,
        width: 40,
        height: 20,
        type: 'strong',
        hits: 0,
        maxHits: 2,
        alive: true,
        color: '#ff7043',
        points: 25
      }
    ];
    const ball: Ball = { x: 120, y: 125, vx: 0, vy: -4, radius: 8 };
    const first = handleBrickCollision(ball, bricks, 1);
    expect(first.hit).toBe(true);
    expect(first.bricks[0].alive).toBe(true);
    const second = handleBrickCollision(first.ball, first.bricks, 1);
    expect(second.bricks[0].alive).toBe(false);
  });

  it('detects stage clear when all bricks destroyed', () => {
    const bricks = createBricks(1).map((b) => ({ ...b, alive: false }));
    expect(isStageClear(bricks)).toBe(true);
  });

  it('detects game complete after final stage', () => {
    expect(isGameComplete(STAGES.length + 1)).toBe(true);
    expect(isGameComplete(STAGES.length)).toBe(false);
  });

  it('returns stage config within bounds', () => {
    expect(getStageConfig(0).stage).toBe(1);
    expect(getStageConfig(99).stage).toBe(STAGES.length);
  });

  it('creates ball above paddle', () => {
    const paddle = createPaddle();
    const ball = createBall(paddle, 5);
    expect(ball.y).toBeLessThan(paddle.y);
    expect(ball.vy).toBeLessThan(0);
  });
});

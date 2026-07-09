import { describe, expect, it, vi } from 'vitest';
import {
  CANVAS_WIDTH,
  applyTimedPowerUp,
  createActiveEffects,
  createBall,
  createBricks,
  createMultiballBalls,
  createPaddle,
  createPowerUpDrop,
  damageBrickAt,
  destroyAdjacentBricks,
  destroyAllBreakableBricks,
  getEffectiveBallSpeed,
  getEffectivePaddleWidth,
  getStageClearBonus,
  getStageConfig,
  handleBrickCollision,
  handleInvincibleBrickCollision,
  handlePaddleCollision,
  handlePowerUpPaddleCollision,
  handleWallCollision,
  isBallLost,
  isDestroyableBrick,
  isGameComplete,
  isInvincibleBallActive,
  isStageClear,
  movePaddle,
  movePowerUps,
  resolveLifeLoss,
  shouldContinueGameLoop,
  shouldDropPowerUp,
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
  });

  it('reflects ball off paddle with angle change', () => {
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
    expect(result.destroyedBricks).toHaveLength(1);
  });

  it('bounces off iron without destroying', () => {
    const bricks: Brick[] = [
      {
        x: 100,
        y: 100,
        width: 40,
        height: 20,
        type: 'iron',
        hits: 0,
        maxHits: 999,
        alive: true,
        color: '#616161',
        points: 0
      }
    ];
    const ball: Ball = { x: 120, y: 125, vx: 2, vy: -4, radius: 8 };
    const result = handleBrickCollision(ball, bricks, 1);
    expect(result.hit).toBe(true);
    expect(result.destroyedBricks).toHaveLength(0);
    expect(result.bricks[0].alive).toBe(true);
  });

  it('explodes adjacent bricks when explosive block breaks', () => {
    const bricks: Brick[] = [
      {
        x: 100,
        y: 100,
        width: 40,
        height: 20,
        type: 'explosive',
        hits: 0,
        maxHits: 1,
        alive: true,
        color: '#ffca28',
        points: 20
      },
      {
        x: 144,
        y: 100,
        width: 40,
        height: 20,
        type: 'normal',
        hits: 0,
        maxHits: 1,
        alive: true,
        color: '#4fc3f7',
        points: 10
      }
    ];
    const result = damageBrickAt(bricks, 0, 1, true);
    expect(result.destroyed.length).toBeGreaterThanOrEqual(2);
    expect(result.bricks.every((b) => !b.alive)).toBe(true);
  });

  it('clears stage when only iron blocks remain', () => {
    const bricks: Brick[] = [
      {
        x: 100,
        y: 100,
        width: 40,
        height: 20,
        type: 'iron',
        hits: 0,
        maxHits: 999,
        alive: true,
        color: '#616161',
        points: 0
      }
    ];
    expect(isStageClear(bricks)).toBe(true);
    expect(isDestroyableBrick(bricks[0])).toBe(false);
  });

  it('pierces destroyable bricks while invincible', () => {
    const bricks: Brick[] = [
      {
        x: 90,
        y: 90,
        width: 40,
        height: 20,
        type: 'strong',
        hits: 0,
        maxHits: 2,
        alive: true,
        color: '#ff7043',
        points: 30
      },
      {
        x: 140,
        y: 90,
        width: 40,
        height: 20,
        type: 'normal',
        hits: 0,
        maxHits: 1,
        alive: true,
        color: '#4fc3f7',
        points: 10
      }
    ];
    const ball: Ball = { x: 135, y: 115, vx: 4, vy: -4, radius: 8 };
    const result = handleInvincibleBrickCollision(ball, bricks, 2);
    expect(result.destroyedBricks).toHaveLength(2);
    expect(result.ball.vx).toBe(4);
  });

  it('destroys all breakable bricks with bomb effect helper', () => {
    const bricks = createBricks(1).slice(0, 4);
    const result = destroyAllBreakableBricks(bricks, 2);
    expect(result.destroyed.length).toBeGreaterThan(0);
    expect(isStageClear(result.bricks)).toBe(true);
  });

  it('always drops item from rainbow brick', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const brick: Brick = {
      x: 10,
      y: 10,
      width: 30,
      height: 20,
      type: 'rainbow',
      hits: 1,
      maxHits: 1,
      alive: false,
      color: '#e040fb',
      points: 50
    };
    expect(shouldDropPowerUp(brick)).toBe(true);
    vi.restoreAllMocks();
  });

  it('returns stage clear bonus by stage', () => {
    expect(getStageClearBonus(1)).toBe(750);
    expect(getStageClearBonus(10)).toBe(3000);
  });

  it('detects game complete after final stage', () => {
    expect(isGameComplete(STAGES.length + 1)).toBe(true);
  });

  it('activates invincible ball for limited time', () => {
    const now = 2_000;
    const effects = applyTimedPowerUp('invincible', createActiveEffects(), now);
    expect(isInvincibleBallActive(effects, now + 1)).toBe(true);
    expect(isInvincibleBallActive(effects, now + 8_001)).toBe(false);
  });

  it('moves and collects falling power-ups', () => {
    const brick: Brick = {
      x: 100,
      y: 100,
      width: 40,
      height: 20,
      type: 'strong',
      hits: 1,
      maxHits: 2,
      alive: false,
      color: '#ff7043',
      points: 30
    };
    const drop = createPowerUpDrop(brick, 'shield');
    const moved = movePowerUps([drop]);
    const paddle = createPaddle();
    paddle.x = moved[0].x;
    paddle.y = moved[0].y;
    const result = handlePowerUpPaddleCollision(moved, paddle);
    expect(result.collected).toHaveLength(1);
  });

  it('resolveLifeLoss decrements life when no shield', () => {
    const result = resolveLifeLoss(3, 0);
    expect(result).toEqual({ lives: 2, shieldCharges: 0, gameOver: false, shieldUsed: false });
  });

  it('resolveLifeLoss ends game on last life', () => {
    const result = resolveLifeLoss(1, 0);
    expect(result).toEqual({ lives: 0, shieldCharges: 0, gameOver: true, shieldUsed: false });
  });

  it('resolveLifeLoss uses shield without losing life', () => {
    const result = resolveLifeLoss(2, 1);
    expect(result).toEqual({ lives: 2, shieldCharges: 0, gameOver: false, shieldUsed: true });
  });

  it('resolveLifeLoss ends game at zero lives even with shield', () => {
    const result = resolveLifeLoss(0, 2);
    expect(result).toEqual({ lives: 0, shieldCharges: 2, gameOver: true, shieldUsed: false });
  });

  it('shouldContinueGameLoop only for active screens', () => {
    expect(shouldContinueGameLoop('playing')).toBe(true);
    expect(shouldContinueGameLoop('ready')).toBe(true);
    expect(shouldContinueGameLoop('paused')).toBe(true);
    expect(shouldContinueGameLoop('stageClear')).toBe(true);
    expect(shouldContinueGameLoop('gameOver')).toBe(false);
    expect(shouldContinueGameLoop('gameWin')).toBe(false);
    expect(shouldContinueGameLoop('menu')).toBe(false);
  });
});

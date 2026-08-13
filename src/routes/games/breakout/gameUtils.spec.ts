import { describe, expect, it, vi } from 'vitest';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  applyTimedPowerUp,
  createActiveEffects,
  createBall,
  createBricks,
  createMultiballBalls,
  addMultiballBalls,
  growBallsOnPaddleHit,
  isMultiballGrowActive,
  MAX_MULTIBALL_COUNT,
  MULTIBALL_DURATION_MS,
  BIG_BALL_RADIUS_MULT,
  BIG_BALL_DAMAGE_MULT,
  BIG_BALL_PIERCE_COUNT,
  BIG_BALL_DURATION_MS,
  BALL_RADIUS,
  getEffectiveBallRadius,
  getBallHitPower,
  getBigBallPierceLeft,
  resetBigBallPierce,
  isBigBallActive,
  syncBallRadii,
  createPaddle,
  createPowerUpDrop,
  damageBrickAt,
  destroyAdjacentBricks,
  destroyAllBreakableBricks,
  getBrickMask,
  getEffectiveBallSpeed,
  getEffectivePaddleWidth,
  buildStageConfig,
  getStageClearBonus,
  getStageConfig,
  getStageKind,
  getStagePattern,
  getBonusShotClearMultiplier,
  getBonusPuzzleGrid,
  resolveBonusMiss,
  buildBonusClearPerformance,
  getBonusClearGrade,
  createAimedBall,
  clampAimAngle,
  aimAngleFromDragRatio,
  createBilliardObjectBalls,
  createMovingObjectBalls,
  stepMovingObject,
  isMoversClear,
  MOVERS_BALL_SPEED,
  MOVERS_TIME_LIMIT_MS,
  createFallingFly,
  stepFallingFlies,
  resolveLaserFlyHits,
  createLaserShot,
  FLIES_TIME_LIMIT_MS,
  getFliesDifficulty,
  getFlyHitScore,
  createStarCollectibles,
  createFallingStar,
  createStarRainIronBricks,
  createBonusIronBricks,
  zonesFromBonusTargets,
  zoneOverlapsBrick,
  shouldSpawnStarRain,
  stepFallingStars,
  tryCollectFallingStar,
  tryCollectFallingStarWithPaddle,
  bounceFallingStarOffIron,
  createGemCollectibles,
  getBonusChallengeType,
  getCushionMultiplier,
  getGemPickupScore,
  isCollectibleClear,
  tryCollectItem,
  createVaultPuzzle,
  resolveVaultHit,
  createCoinCollectibles,
  getBonusAttemptLimit,
  getCoinPickupScore,
  getRequiredCushions,
  handleEnclosedCushionCollision,
  handlePaddleCollision,
  handleTopAndSideCushionCollision,
  isBilliardClear,
  resolveCueObjectHit,
  getBonusTimeLimitMs,
  SPIN_BALL_SPEED,
  SPIN_TIME_LIMIT_MS,
  TOTAL_STAGES,
  handleBrickCollision,
  handleInvincibleBrickCollision,
  handleLaserBrickCollision,
  handlePowerUpPaddleCollision,
  handleWallCollision,
  isBallLost,
  isDestroyableBrick,
  isGameComplete,
  getNextStage,
  BONUS_ONLY_TEST,
  BONUS_STAGE_LIST,
  isInvincibleBallActive,
  isStageClear,
  movePaddle,
  movePowerUps,
  resolveLifeLoss,
  bounceBallOffFloor,
  noteIronHit,
  clearIronStreak,
  shouldEscapeIronTrap,
  escapeIronTrap,
  IRON_TRAP_ESCAPE_MS,
  IRON_TRAP_MIN_HITS,
  IRON_TRAP_MAX_HITS,
  shouldContinueGameLoop,
  shouldDropPowerUp,
  pickPowerUpType,
  BOMB_DROP_CHANCE_PER_PICK,
  STAGES,
  type Ball,
  type Brick
} from './gameUtils';

describe('breakout gameUtils', () => {
  it('defines 50 stages with rising difficulty', () => {
    expect(STAGES).toHaveLength(TOTAL_STAGES);
    expect(STAGES).toHaveLength(50);
    expect(STAGES[0].kind).toBe('normal');
    expect(STAGES[0].label).toBe('1단계');
    expect(STAGES[49].label).toBe('최종');
    expect(STAGES[0].ballSpeed).toBeLessThan(STAGES[49].ballSpeed);
    expect(STAGES[49].kind).toBe('theme');
    for (const stage of STAGES) {
      const specialSum =
        stage.strongRatio + stage.explosiveRatio + stage.ironRatio + stage.rainbowRatio;
      expect(specialSum).toBeLessThan(0.9);
      expect(buildStageConfig(stage.stage)).toEqual(stage);
    }
  });

  it('classifies bonus and theme stages', () => {
    expect(getStageKind(5)).toBe('bonus');
    expect(getStageKind(10)).toBe('bonus');
    expect(getStageKind(15)).toBe('bonus');
    expect(getStageKind(45)).toBe('bonus');
    expect(getStageKind(20)).toBe('theme');
    expect(getStageKind(50)).toBe('theme');
    expect(getStageKind(1)).toBe('normal');
    expect(getStageKind(7)).toBe('normal');
    expect(getStageConfig(5).label).toBe('3쿠션 챌린지');
    expect(getStageConfig(10).label).toBe('이동 공 챌린지');
    expect(getStageConfig(1).label).toBe('1단계');
    expect(getStageConfig(45).label).toBe('금고 열기');
    expect(getStageConfig(35).label).toBe('골든샷');
    expect(getStageConfig(20).label).toBe('폭발 연쇄');
    expect(getStageConfig(30).label).toBe('무지개 사냥');
  });

  it('builds deterministic brick masks per stage', () => {
    for (let stage = 1; stage <= TOTAL_STAGES; stage++) {
      const maskA = getBrickMask(stage);
      const maskB = getBrickMask(stage);
      expect(maskA).toEqual(maskB);
      expect(maskA).toHaveLength(6);
      expect(maskA[0]).toHaveLength(10);
      const cells = maskA.flat().filter(Boolean).length;
      expect(cells).toBeGreaterThan(0);
      expect(getStagePattern(stage)).toBeTruthy();
    }
    expect(getStagePattern(1)).toBe('full');
    expect(getStagePattern(5)).toBe('cushion');
    expect(getStagePattern(10)).toBe('lane');
    expect(getStagePattern(20)).toBe('checker');
    expect(getStagePattern(15)).toBe('pockets');
    expect(getStagePattern(45)).toBe('bank');
  });

  it('bonus stages use fixed iron-and-brick puzzle grids', () => {
    for (const stage of [5, 10, 15, 25, 35, 45]) {
      const grid = getBonusPuzzleGrid(stage);
      expect(grid).not.toBeNull();
      const bricks = createBricks(stage);
      const destroyable = bricks.filter(isDestroyableBrick);
      const iron = bricks.filter((b) => b.type === 'iron');
      expect(destroyable.length).toBeGreaterThan(0);
      expect(iron.length).toBeGreaterThan(0);
      expect(isStageClear(bricks)).toBe(false);
      // 같은 스테이지면 배치 재현
      const again = createBricks(stage);
      expect(again.map((b) => `${b.type}:${b.x}:${b.y}`)).toEqual(
        bricks.map((b) => `${b.type}:${b.x}:${b.y}`)
      );
    }
    expect(getBonusPuzzleGrid(1)).toBeNull();
  });

  it('creates bricks for each stage with destroyable cells', () => {
    for (const stage of STAGES) {
      const bricks = createBricks(stage.stage);
      expect(bricks.length).toBeGreaterThan(0);
      expect(bricks.every((b) => b.alive)).toBe(true);
      expect(bricks.some(isDestroyableBrick)).toBe(true);
      expect(isStageClear(bricks)).toBe(false);
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
    const bricks = createBricks(2);
    const target = bricks.find((b) => b.type === 'normal') ?? bricks.find(isDestroyableBrick)!;
    const ball: Ball = {
      x: target.x + target.width / 2,
      y: target.y + target.height + 5,
      vx: 0,
      vy: -4,
      radius: 8
    };
    const result = handleBrickCollision(ball, bricks, 2);
    expect(result.hit).toBe(true);
    expect(result.destroyedBricks.length).toBeGreaterThan(0);
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
    expect(result.hitIron).toBe(true);
    expect(result.destroyedBricks).toHaveLength(0);
    expect(result.bricks[0].alive).toBe(true);
  });

  it('escapes iron trap after sustained iron-only hits', () => {
    const paddle = createPaddle();
    let ball = createBall(paddle, 6);
    const t0 = 1_000;
    for (let i = 0; i < IRON_TRAP_MIN_HITS; i++) {
      ball = noteIronHit(ball, t0 + i * 100);
    }
    expect(shouldEscapeIronTrap(ball, t0 + 500)).toBe(false);
    expect(shouldEscapeIronTrap(ball, t0 + IRON_TRAP_ESCAPE_MS)).toBe(true);

    let capped = createBall(paddle, 6);
    for (let i = 0; i < IRON_TRAP_MAX_HITS; i++) {
      capped = noteIronHit(capped, t0);
    }
    expect(shouldEscapeIronTrap(capped, t0 + 100)).toBe(true);

    const escaped = escapeIronTrap({ ...ball, x: 200, y: 120, vx: 3, vy: -3 }, 6, () => 0.5);
    expect(escaped.vy).toBeGreaterThan(0);
    expect(escaped.y).toBeGreaterThan(120);
    expect(escaped.ironStreak).toBeUndefined();
    expect(clearIronStreak(noteIronHit(ball, t0)).ironStreak).toBeUndefined();
  });

  it('laser stops on iron without piercing', () => {
    const paddle = createPaddle();
    const laser = { ...createLaserShot(paddle), x: 120, y: 110 };
    const iron: Brick = {
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
    };
    const normal: Brick = {
      x: 100,
      y: 60,
      width: 40,
      height: 20,
      type: 'normal',
      hits: 0,
      maxHits: 1,
      alive: true,
      color: '#42a5f5',
      points: 10
    };
    const hit = handleLaserBrickCollision([laser], [iron, normal], 1);
    expect(hit.lasers[0].alive).toBe(false);
    expect(hit.bricks.find((b) => b.type === 'iron')?.alive).toBe(true);
    expect(hit.bricks.find((b) => b.type === 'normal')?.alive).toBe(true);
    expect(hit.destroyedBricks).toHaveLength(0);
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
    const bricks = createBricks(2).filter(isDestroyableBrick).slice(0, 4);
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

  it('picks bomb rarely (~1 per 3 stages)', () => {
    expect(BOMB_DROP_CHANCE_PER_PICK).toBeCloseTo(1 / 15);
    expect(pickPowerUpType('normal', () => 0)).toBe('bomb');
    // bomb 문턱 이상이면 일반 풀
    const notBomb = pickPowerUpType('normal', () => 0.5);
    expect(notBomb).not.toBe('bomb');
  });

  it('returns stage clear bonus by stage', () => {
    expect(getStageClearBonus(2)).toBe(1000);
    expect(getStageClearBonus(1, 1)).toBe(750);
    expect(getStageClearBonus(1, 2)).toBe(750);
    expect(getStageClearBonus(10, 1)).toBe(6000);
    expect(getStageClearBonus(10, 2)).toBe(3000);
    expect(getStageClearBonus(20)).toBe(5500);
    expect(getStageClearBonus(50)).toBe(13_000);
    expect(getStageClearBonus(5, 1)).toBe(3500);
    expect(getStageClearBonus(5, 2)).toBe(1750);
    expect(getStageClearBonus(15, 1)).toBe(8500);
    expect(getStageClearBonus(15, 2)).toBe(4250);
  });

  it('bonus aim helpers clamp angle and create velocity', () => {
    expect(clampAimAngle(0)).toBe(25);
    expect(clampAimAngle(200)).toBe(155);
    expect(aimAngleFromDragRatio(0.5)).toBe(90);
    const paddle = createPaddle();
    const up = createAimedBall(paddle, 6, 90);
    expect(up.vx).toBeCloseTo(0, 5);
    expect(up.vy).toBeCloseTo(-6, 5);
    const rightish = createAimedBall(paddle, 6, 45);
    expect(rightish.vx).toBeGreaterThan(0);
    expect(rightish.vy).toBeLessThan(0);
  });

  it('bonus miss allows two attempts then skip without life loss', () => {
    expect(resolveBonusMiss(1)).toBe('retry');
    expect(resolveBonusMiss(2)).toBe('skip');
    expect(getBonusShotClearMultiplier(1)).toBe(2);
    expect(getBonusShotClearMultiplier(2)).toBe(1);
  });

  it('billiard 4-ball layout and clear rules', () => {
    const objects = createBilliardObjectBalls(5);
    expect(objects).toHaveLength(3);
    expect(objects.filter((b) => b.kind === 'red')).toHaveLength(2);
    expect(objects.filter((b) => b.kind === 'yellow')).toHaveLength(1);
    expect(getRequiredCushions(1)).toBe(1);
    expect(getRequiredCushions(15)).toBe(2);
    expect(getRequiredCushions(45)).toBe(4);
    expect(isBilliardClear(0, 1, objects)).toBe(false);
    const allHit = objects.map((b) => ({ ...b, hit: true }));
    expect(isBilliardClear(1, 1, allHit)).toBe(true);
    expect(isBilliardClear(0, 1, allHit)).toBe(false);
  });

  it('star and gem collectible challenges', () => {
    expect(getBonusChallengeType(5)).toBe('billiard');
    expect(getBonusChallengeType(10)).toBe('movers');
    expect(getBonusChallengeType(15)).toBe('stars');
    expect(getBonusChallengeType(25)).toBe('gems');
    expect(getBonusChallengeType(35)).toBe('golden');
    expect(getBonusChallengeType(45)).toBe('vault');
    expect(getStageKind(1)).toBe('normal');
    expect(getCushionMultiplier(1)).toBe(1);
    expect(getCushionMultiplier(3)).toBe(4);
    expect(getCushionMultiplier(5)).toBe(16);
    expect(getGemPickupScore(100, 2, 3)).toBe(800);
    expect(getCoinPickupScore(60, 2, 3)).toBe(480);
    expect(getBonusAttemptLimit('golden')).toBe(1);
    expect(getBonusAttemptLimit('vault')).toBe(2);
    expect(getBonusAttemptLimit('spin')).toBe(1);
    expect(getBonusAttemptLimit('flies')).toBe(1);
    expect(getBonusAttemptLimit('movers')).toBe(2);
    expect(getBonusTimeLimitMs('movers')).toBe(MOVERS_TIME_LIMIT_MS);
    expect(getBonusTimeLimitMs('flies')).toBe(FLIES_TIME_LIMIT_MS);

    const stars = createStarCollectibles(15);
    expect(stars.length).toBeGreaterThanOrEqual(5);
    expect(isCollectibleClear(stars)).toBe(false);
    const paddle = createPaddle();
    const cue = createAimedBall(paddle, 6, 90);
    cue.x = stars[0].x;
    cue.y = stars[0].y;
    const picked = tryCollectItem(cue, stars[0]);
    expect(picked.collected).toBe(true);

    const gems = createGemCollectibles(25);
    expect(gems.every((g) => g.kind === 'gem')).toBe(true);
    expect(createCoinCollectibles(35).every((c) => c.kind === 'coin')).toBe(true);
  });

  it('movers helpers keep speed and clear on all hits', () => {
    expect(getBonusTimeLimitMs('movers')).toBe(MOVERS_TIME_LIMIT_MS);

    const objects = createMovingObjectBalls(1);
    expect(objects).toHaveLength(3);
    expect(objects.filter((b) => b.kind === 'red')).toHaveLength(2);
    expect(objects.filter((b) => b.kind === 'yellow')).toHaveLength(1);
    expect(objects.every((b) => Math.hypot(b.vx, b.vy) > 0)).toBe(true);

    const moved = objects.map((b) => stepMovingObject(b));
    expect(moved.some((b, i) => b.x !== objects[i].x || b.y !== objects[i].y)).toBe(true);
    for (const b of moved) {
      expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(MOVERS_BALL_SPEED, 5);
    }

    const nearLeft = {
      ...objects[0],
      x: objects[0].radius + 1,
      y: 200,
      vx: -MOVERS_BALL_SPEED,
      vy: 0
    };
    const bounced = stepMovingObject(nearLeft);
    expect(bounced.vx).toBeGreaterThan(0);

    expect(isMoversClear(objects)).toBe(false);
    const allHit = objects.map((b) => ({ ...b, hit: true }));
    expect(isMoversClear(allHit)).toBe(true);
    expect(isBilliardClear(0, 0, allHit)).toBe(true);
  });

  it('flies helpers: laser hits, escape fails, one attempt', () => {
    expect(getBonusAttemptLimit('flies')).toBe(1);
    expect(getBonusTimeLimitMs('flies')).toBe(FLIES_TIME_LIMIT_MS);
    // 1단계는 일반 — flies는 타입만 유지
    expect(getStageKind(1)).toBe('normal');

    expect(getFliesDifficulty(0).maxActive).toBe(1);
    expect(getFliesDifficulty(5_000).maxActive).toBe(2);
    expect(getFliesDifficulty(12_000).maxActive).toBe(4);
    expect(getFliesDifficulty(12_000).intervalMs).toBeLessThan(getFliesDifficulty(0).intervalMs);
    expect(getFliesDifficulty(0).fallScale).toBeCloseTo(1.3);

    const fly = createFallingFly(0, () => 0.5);
    const stepped = stepFallingFlies([fly]);
    expect(stepped.escaped).toBe(false);
    expect(stepped.flies[0].y).toBeGreaterThan(fly.y);

    const escaping = { ...fly, y: 900, vy: 20 };
    expect(stepFallingFlies([escaping]).escaped).toBe(true);

    const paddle = createPaddle();
    const laser = createLaserShot(paddle);
    laser.x = fly.x;
    laser.y = fly.y;
    const hit = resolveLaserFlyHits([laser], [fly]);
    expect(hit.hitFlies).toHaveLength(1);
    expect(hit.flies).toHaveLength(0);
    expect(getFlyHitScore(80, 1)).toBe(80);
  });

  it('spin stage is star rain caught by paddle with iron obstacles', () => {
    expect(getBonusTimeLimitMs('spin')).toBe(SPIN_TIME_LIMIT_MS);
    expect(SPIN_BALL_SPEED).toBeGreaterThan(0);

    const irons = createStarRainIronBricks();
    expect(irons.length).toBeGreaterThanOrEqual(1);
    expect(irons.length).toBeLessThanOrEqual(2);
    expect(irons.every((b) => b.type === 'iron')).toBe(true);

    const one = createBonusIronBricks(() => 0.1);
    expect(one).toHaveLength(1);
    let n = 0;
    const seq = [0.9, 0.05, 0.2, 0.55, 0.8, 0.35];
    const two = createBonusIronBricks(() => seq[Math.min(n++, seq.length - 1)]!);
    expect(two).toHaveLength(2);

    const stars = createStarCollectibles(15);
    const zones = zonesFromBonusTargets({ collectibles: stars });
    expect(zones.length).toBe(stars.length);
    let m = 0;
    const avoidSeq = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.15, 0.25, 0.35];
    const avoidedIrons = createBonusIronBricks(
      () => avoidSeq[Math.min(m++, avoidSeq.length - 1)]!,
      zones
    );
    expect(avoidedIrons.length).toBeGreaterThanOrEqual(1);
    for (const iron of avoidedIrons) {
      for (const z of zones) {
        expect(zoneOverlapsBrick(z, iron, 6)).toBe(false);
      }
    }

    const objects = createBilliardObjectBalls(5);
    const billiardIrons = createBonusIronBricks(() => 0.3, zonesFromBonusTargets({ objects }));
    for (const iron of billiardIrons) {
      for (const o of objects) {
        expect(zoneOverlapsBrick({ x: o.x, y: o.y, radius: o.radius }, iron, 6)).toBe(false);
      }
    }

    const star = createFallingStar(0, () => 0.5);
    expect(star.vx).toBe(0);
    const stepped = stepFallingStars([star]);
    expect(stepped[0].y).toBeGreaterThan(star.y);

    const paddle = createPaddle();
    const onPaddle = { ...star, x: paddle.x + paddle.width / 2, y: paddle.y };
    expect(tryCollectFallingStarWithPaddle(paddle, onPaddle)).toBe(true);
    expect(tryCollectFallingStarWithPaddle(paddle, star)).toBe(false);

    const aboveIron = {
      ...star,
      x: irons[0].x + irons[0].width / 2,
      y: irons[0].y + irons[0].height / 2,
      vy: 3
    };
    const passed = bounceFallingStarOffIron(aboveIron, irons);
    expect(passed.y).toBe(aboveIron.y);
    expect(passed.vy).toBe(aboveIron.vy);

    const descending: Ball = {
      x: paddle.x + paddle.width / 2,
      y: paddle.y - 5,
      vx: 1,
      vy: 4,
      radius: 8
    };
    expect(handlePaddleCollision(descending, paddle).hit).toBe(true);
  });

  it('vault sequence puzzle accepts correct order only', () => {
    const puzzle = createVaultPuzzle(5);
    expect(puzzle.sequence).toEqual([1, 2, 3]);
    expect(puzzle.targets).toHaveLength(3);
    const paddle = createPaddle();
    const cue = createAimedBall(paddle, 6, 90);
    const first = puzzle.targets.find((t) => t.number === 1)!;
    cue.x = first.x;
    cue.y = first.y;
    const ok = resolveVaultHit(puzzle.targets, puzzle.sequence, 0, cue);
    expect(ok.correct).toBe(true);
    expect(ok.sequenceIndex).toBe(1);

    const wrongTarget = puzzle.targets.find((t) => t.number === 3)!;
    cue.x = wrongTarget.x;
    cue.y = wrongTarget.y;
    const bad = resolveVaultHit(ok.targets, puzzle.sequence, 1, cue);
    expect(bad.wrong).toBe(true);
    expect(bad.sequenceIndex).toBe(1);
  });

  it('vault hard stage uses four-target bank path', () => {
    const hard = createVaultPuzzle(45);
    expect(hard.sequence).toEqual([1, 2, 3, 4]);
    expect(hard.targets).toHaveLength(4);
  });

  it('enclosed cushion and cue-object hit', () => {
    const wall = handleEnclosedCushionCollision({
      x: 2,
      y: 100,
      vx: -3,
      vy: 1,
      radius: 8
    });
    expect(wall.cushionHit).toBe(true);
    expect(wall.ball.vx).toBeGreaterThan(0);

    const paddle = createPaddle();
    const cue = createAimedBall(paddle, 6, 90);
    cue.x = 200;
    cue.y = 200;
    const obj = createBilliardObjectBalls(5)[0];
    obj.x = 200;
    obj.y = 210;
    const hit = resolveCueObjectHit(cue, obj);
    expect(hit.scored).toBe(true);
    expect(hit.obj.hit).toBe(true);
  });

  it('detects game complete after final stage', () => {
    expect(isGameComplete(STAGES.length + 1)).toBe(true);
    expect(isGameComplete(50)).toBe(false);
    expect(isGameComplete(51)).toBe(true);
  });

  it('bonus-only test jumps between bonus stages', () => {
    expect(BONUS_STAGE_LIST).toEqual([5, 10, 15, 25, 35, 45]);
    if (BONUS_ONLY_TEST) {
      expect(getNextStage(5)).toBe(10);
      expect(getNextStage(10)).toBe(15);
      expect(getNextStage(45)).toBe(TOTAL_STAGES + 1);
      expect(isGameComplete(getNextStage(45))).toBe(true);
    } else {
      expect(getNextStage(1)).toBe(2);
      expect(getNextStage(45)).toBe(46);
      expect(getNextStage(50)).toBe(51);
    }
  });

  it('activates invincible ball for limited time', () => {
    const now = 2_000;
    const effects = applyTimedPowerUp('invincible', createActiveEffects(), now);
    expect(isInvincibleBallActive(effects, now + 1)).toBe(true);
    expect(isInvincibleBallActive(effects, now + 8_001)).toBe(false);
  });

  it('multiball grows on paddle hits and stacks pickups', () => {
    const now = 1_000;
    const effects = applyTimedPowerUp('multiball', createActiveEffects(), now);
    expect(isMultiballGrowActive(effects, now + 1)).toBe(true);
    expect(isMultiballGrowActive(effects, now + MULTIBALL_DURATION_MS + 1)).toBe(false);

    const paddle = createPaddle();
    const source = createBall(paddle, 6);
    source.vy = -6;
    let balls = [source];
    balls = addMultiballBalls(balls, source, 6);
    expect(balls.length).toBe(3);

    balls = addMultiballBalls(balls, balls[0]!, 6);
    expect(balls.length).toBe(5);

    const grown = growBallsOnPaddleHit(balls, balls[0]!, 6);
    expect(grown.length).toBe(6);
    expect(grown[grown.length - 1]!.vy).toBeLessThan(0);

    let capped = grown;
    while (capped.length < MAX_MULTIBALL_COUNT) {
      capped = growBallsOnPaddleHit(capped, capped[0]!, 6);
    }
    expect(capped.length).toBe(MAX_MULTIBALL_COUNT);
    expect(growBallsOnPaddleHit(capped, capped[0]!, 6).length).toBe(MAX_MULTIBALL_COUNT);
    expect(createMultiballBalls(source, 6)).toHaveLength(3);
  });

  it('bigBall triples radius for limited time', () => {
    const now = 3_000;
    const effects = applyTimedPowerUp('bigBall', createActiveEffects(), now);
    expect(isBigBallActive(effects, now + 1)).toBe(true);
    expect(isBigBallActive(effects, now + BIG_BALL_DURATION_MS + 1)).toBe(false);
    expect(getEffectiveBallRadius(effects, now + 1)).toBe(BALL_RADIUS * BIG_BALL_RADIUS_MULT);
    expect(getEffectiveBallRadius(createActiveEffects(), now)).toBe(BALL_RADIUS);

    const paddle = createPaddle();
    const ball = createBall(paddle, 5);
    expect(ball.radius).toBe(BALL_RADIUS);
    const synced = syncBallRadii([ball], effects, now + 1);
    expect(synced[0]!.radius).toBe(BALL_RADIUS * BIG_BALL_RADIUS_MULT);
    expect(synced[0]!.pierceLeft).toBe(BIG_BALL_PIERCE_COUNT);
    const restored = syncBallRadii(synced, createActiveEffects(), now + 1);
    expect(restored[0]!.radius).toBe(BALL_RADIUS);
    expect(restored[0]!.pierceLeft).toBeUndefined();
  });

  it('bigBall hits with 3x damage and one-shots strong bricks', () => {
    const paddle = createPaddle();
    const normalBall = createBall(paddle, 5);
    const bigBall = {
      ...normalBall,
      radius: BALL_RADIUS * BIG_BALL_RADIUS_MULT,
      pierceLeft: 0
    };
    expect(getBallHitPower(normalBall)).toBe(1);
    expect(getBallHitPower(bigBall)).toBe(BIG_BALL_DAMAGE_MULT);

    const strong: Brick = {
      x: 100,
      y: 80,
      width: 40,
      height: 20,
      type: 'strong',
      hits: 0,
      maxHits: 2,
      alive: true,
      color: '#ff7043',
      points: 30
    };
    const oneHit = damageBrickAt([strong], 0, 1, true, false, 1);
    expect(oneHit.bricks[0]!.alive).toBe(true);
    expect(oneHit.bricks[0]!.hits).toBe(1);

    const bigHit = damageBrickAt([strong], 0, 1, true, false, BIG_BALL_DAMAGE_MULT);
    expect(bigHit.bricks[0]!.alive).toBe(false);
    expect(bigHit.destroyed).toHaveLength(1);

    const colliding = {
      ...bigBall,
      x: strong.x + strong.width / 2,
      y: strong.y + strong.height + bigBall.radius - 1,
      vy: -5
    };
    const result = handleBrickCollision(colliding, [strong], 1);
    expect(result.hit).toBe(true);
    expect(result.destroyedBricks).toHaveLength(1);
  });

  it('bigBall pierces up to 3 bricks without bouncing', () => {
    const makeBrick = (x: number): Brick => ({
      x,
      y: 100,
      width: 40,
      height: 20,
      type: 'normal',
      hits: 0,
      maxHits: 1,
      alive: true,
      color: '#4fc3f7',
      points: 10
    });
    const bricks = [makeBrick(100), makeBrick(144), makeBrick(188), makeBrick(232)];
    const ball: Ball = {
      x: 120,
      y: 110,
      vx: 5,
      vy: -5,
      radius: BALL_RADIUS * BIG_BALL_RADIUS_MULT,
      pierceLeft: BIG_BALL_PIERCE_COUNT
    };
    expect(getBigBallPierceLeft(ball)).toBe(3);

    const first = handleBrickCollision(ball, bricks, 1);
    expect(first.hit).toBe(true);
    expect(first.ball.vy).toBe(ball.vy);
    expect(first.ball.pierceLeft).toBeLessThan(BIG_BALL_PIERCE_COUNT);
    expect(first.destroyedBricks.length).toBeGreaterThanOrEqual(1);

    const afterPaddle = resetBigBallPierce({ ...first.ball, pierceLeft: 0 });
    expect(afterPaddle.pierceLeft).toBe(BIG_BALL_PIERCE_COUNT);

    const noPierce = handleBrickCollision(
      { ...ball, pierceLeft: 0, y: 110, vy: 5 },
      [makeBrick(100)],
      1
    );
    expect(noPierce.hit).toBe(true);
    expect(noPierce.ball.vy).toBeLessThan(0);
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

  it('bounceBallOffFloor sends ball upward from canvas bottom', () => {
    const paddle = createPaddle();
    const fallen = {
      ...createBall(paddle, 6),
      y: CANVAS_HEIGHT + 20,
      vy: 6,
      vx: 3
    };
    const bounced = bounceBallOffFloor(fallen, 6);
    expect(bounced.y).toBeLessThan(CANVAS_HEIGHT);
    expect(bounced.y + bounced.radius).toBeLessThanOrEqual(CANVAS_HEIGHT);
    expect(bounced.vy).toBeLessThan(0);
    expect(Math.hypot(bounced.vx, bounced.vy)).toBeCloseTo(6, 5);
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
    expect(shouldContinueGameLoop('bonusIntro')).toBe(false);
  });

  it('builds bonus clear performance with grade and score lines', () => {
    const oneShot = buildBonusClearPerformance({
      challenge: 'spin',
      stage: 1,
      playScore: 800,
      attemptsUsed: 1,
      starRainCaught: 24
    });
    expect(oneShot.shotMultiplier).toBe(2);
    expect(oneShot.cleared).toBe(true);
    expect(oneShot.grade).toBe('S');
    expect(oneShot.gradeLabel).toBe('PERFECT');
    expect(oneShot.lines.some((l) => l.label.includes('×2'))).toBe(true);
    expect(oneShot.totalAdded).toBe(800 * 2 + getStageClearBonus(1, 1));

    const second = buildBonusClearPerformance({
      challenge: 'billiard',
      stage: 5,
      playScore: 400,
      attemptsUsed: 2
    });
    expect(second.shotMultiplier).toBe(1);
    expect(second.grade).toBe('C');
    expect(getBonusClearGrade('spin', { attemptsUsed: 1, playScore: 0, starRainCaught: 10 })).toBe(
      'B'
    );

    const failed = buildBonusClearPerformance({
      challenge: 'flies',
      stage: 1,
      playScore: 240,
      attemptsUsed: 1,
      fliesCaught: 3,
      cleared: false
    });
    expect(failed.cleared).toBe(false);
    expect(failed.shotMultiplier).toBe(1);
    expect(failed.totalAdded).toBe(240);
    expect(failed.gradeLabel).toBe('FAIL');
    expect(failed.title).toContain('실패');
    expect(failed.lines.some((l) => l.label === '클리어 보너스' && l.value === 0)).toBe(true);
  });
});

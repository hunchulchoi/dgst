<script lang="ts">
  import { beforeNavigate } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { onMount, tick } from 'svelte';
  import { ko } from 'date-fns/locale';
  import { formatRelativeTime } from '$lib/util/formatRelativeTime.js';
  import type { PageData } from './$types';
  import {
    AIM_ANGLE_STEP,
    BALL_RADIUS,
    BILLIARD_HIT_SCORE,
    BILLIARD_TIME_LIMIT_MS,
    BONUS_MAX_ATTEMPTS,
    CANVAS_HEIGHT,
    CANVAS_WIDTH,
    COMBO_WINDOW_MS,
    createActiveEffects,
    createAimedBall,
    createBall,
    createBilliardObjectBalls,
    createMovingObjectBalls,
    isMoversClear,
    MOVERS_TIME_LIMIT_MS,
    stepMovingObject,
    createBricks,
    createGemCollectibles,
    createStarCollectibles,
    createFallingStar,
    createFallingFly,
    createStarRainIronBricks,
    createBonusIronBricks,
    shouldSpawnStarRain,
    shouldSpawnFly,
    stepFallingStars,
    stepFallingFlies,
    resolveLaserFlyHits,
    getFlyHitScore,
    FLIES_LASER_INTERVAL_MS,
    FLIES_TIME_LIMIT_MS,
    getFliesDifficulty,
    tryCollectFallingStarWithPaddle,
    bounceFallingStarOffIron,
    createCoinCollectibles,
    createVaultPuzzle,
    VAULT_AIM_ANGLE,
    createDropsFromDestroyedBricks,
    createLaserShot,
    addMultiballBalls,
    growBallsOnPaddleHit,
    isMultiballGrowActive,
    syncBallRadii,
    resetBigBallPierce,
    createPaddle,
    createPowerUpDrop,
    DEFAULT_AIM_ANGLE,
    destroyAllBreakableBricks,
    dragRatioFromAimAngle,
    getActiveEffectLabels,
    getAimLineEnd,
    getBonusShotClearMultiplier,
    getBonusChallengeType,
    getBilliardTimeLeftMs,
    getCushionMultiplier,
    getCoinPickupScore,
    getGemPickupScore,
    getStarPickupScore,
    getBonusAttemptLimit,
    getBonusTimeLimitMs,
    getEffectiveBallSpeed,
    getEffectivePaddleWidth,
    getRequiredCushions,
    getStageClearBonus,
    getStageConfig,
    buildBonusClearPerformance,
    handleBrickCollision,
    handleTopAndSideCushionCollision,
    handleInvincibleBrickCollision,
    handleLaserBrickCollision,
    handlePaddleCollision,
    handlePowerUpPaddleCollision,
    handleWallCollision,
    INITIAL_LIVES,
    isBilliardClear,
    countHitBilliardBalls,
    countCollectedItems,
    isCollectibleClear,
    tryCollectItem,
    resolveVaultHit,
    resolveBonusMiss,
    resolveCueObjectHit,
    resolveLifeLoss,
    shouldContinueGameLoop,
    isBallLost,
    isGameComplete,
    getNextStage,
    BONUS_ONLY_TEST,
    BONUS_STAGE_LIST,
    START_STAGE,
    isInvincibleBallActive,
    isLaserActive,
    isStageClear,
    LASER_INTERVAL_MS,
    MAX_LIVES,
    moveBall,
    moveLasers,
    movePaddle,
    movePowerUps,
    normalizeAllBallSpeeds,
    normalizeBallSpeed,
    PADDLE_SPEED,
    POWER_UP_META,
    resizePaddle,
    STAGES,
    stepBilliardObject,
    aimAngleFromDragRatio,
    applyTimedPowerUp,
    calculateComboBonus,
    clampAimAngle,
    type ActiveEffects,
    type Ball,
    type BilliardBall,
    type BonusChallengeType,
    type BonusCollectible,
    type BonusClearPerformance,
    type FallingStar,
    type FallingFly,
    type VaultTarget,
    type Brick,
    type Laser,
    type Paddle,
    type PowerUp,
    type PowerUpType
  } from './gameUtils.js';

  interface BreakoutPageProps {
    data: PageData;
  }

  let { data }: BreakoutPageProps = $props();

  type Screen =
    | 'menu'
    | 'playing'
    | 'paused'
    | 'stageClear'
    | 'gameOver'
    | 'gameWin'
    | 'ready'
    | 'bonusIntro';

  let screen = $state<Screen>('menu');
  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let dragBarEl = $state<HTMLDivElement | null>(null);
  let ctx: CanvasRenderingContext2D | null = null;
  let paddle = $state<Paddle>(createPaddle());
  let balls = $state<Ball[]>([]);
  let bricks = $state<Brick[]>([]);
  let powerUps = $state<PowerUp[]>([]);
  let lasers = $state<Laser[]>([]);
  let activeEffects = $state<ActiveEffects>(createActiveEffects());
  let effectToast = $state<string | null>(null);
  let effectToastUntil = 0;
  let shieldCharges = $state(0);
  let comboCount = $state(0);
  let lastComboAt = 0;
  let lastLaserShotAt = 0;
  let stage = $state(1);
  let score = $state(0);
  let lives = $state(INITIAL_LIVES);
  let ballLaunched = $state(false);
  let aimAngle = $state(DEFAULT_AIM_ANGLE);
  let bonusAttemptsUsed = $state(0);
  let bonusStageScoreStart = $state(0);
  let bonusClearPerf = $state<BonusClearPerformance | null>(null);
  let bonusClearStartedAt = $state(0);
  let billiardObjects = $state<BilliardBall[]>([]);
  let bonusCollectibles = $state<BonusCollectible[]>([]);
  let fallingStars = $state<FallingStar[]>([]);
  let fallingFlies = $state<FallingFly[]>([]);
  let starRainCaught = $state(0);
  let fliesCaught = $state(0);
  let starRainSeq = 0;
  let flySeq = 0;
  let lastStarSpawnAt = 0;
  let lastFlySpawnAt = 0;
  let vaultTargets = $state<VaultTarget[]>([]);
  let vaultSequence = $state<number[]>([]);
  let vaultSequenceIndex = $state(0);
  let vaultTouchId = $state<string | null>(null);
  let cushionCount = $state(0);
  let billiardEndsAt = $state(0);
  let requiredCushions = $state(1);
  let frameId = 0;
  let stageClearTimeout: ReturnType<typeof setTimeout> | null = null;
  let keys = $state({ left: false, right: false });
  let dragBarActive = $state(false);
  let dragStartX = 0;
  let dragMoved = false;

  let rankList = $state<
    Array<{ nickname: string; score: number; stage?: number; createdAt?: string; _id?: string }>
  >([]);
  let myBestScore = $state<number | null>(null);
  let myBestStage = $state<number | null>(null);
  let myBestCreatedAt = $state<string | null>(null);
  let todayStats = $state<{ games: number; users: number }>({ games: 0, users: 0 });
  let rankLoading = $state(false);
  let submittedScoreKey: string | null = null;

  const isLoggedIn = $derived(!!data.session?.user?.email);
  const stageConfig = $derived(getStageConfig(stage));
  const isBonusStage = $derived(stageConfig.kind === 'bonus');
  const bonusChallenge = $derived<BonusChallengeType>(
    isBonusStage ? getBonusChallengeType(stage) : 'billiard'
  );
  const isBonusAiming = $derived(
    isBonusStage &&
      !ballLaunched &&
      bonusChallenge !== 'flies' &&
      (screen === 'ready' || screen === 'paused')
  );
  const dragThumbPercent = $derived(
    isBonusAiming
      ? dragRatioFromAimAngle(aimAngle) * 100
      : ((paddle.x + paddle.width / 2) / CANVAS_WIDTH) * 100
  );

  function resetRoundState() {
    powerUps = [];
    lasers = [];
    activeEffects = createActiveEffects();
    effectToast = null;
    effectToastUntil = 0;
    shieldCharges = 0;
    comboCount = 0;
    lastComboAt = 0;
    lastLaserShotAt = 0;
    aimAngle = DEFAULT_AIM_ANGLE;
    bonusAttemptsUsed = 0;
    bonusClearPerf = null;
    bonusClearStartedAt = 0;
    billiardObjects = [];
    bonusCollectibles = [];
    fallingStars = [];
    fallingFlies = [];
    starRainCaught = 0;
    fliesCaught = 0;
    starRainSeq = 0;
    flySeq = 0;
    lastStarSpawnAt = 0;
    lastFlySpawnAt = 0;
    vaultTargets = [];
    vaultSequence = [];
    vaultSequenceIndex = 0;
    vaultTouchId = null;
    cushionCount = 0;
    billiardEndsAt = 0;
    requiredCushions = 1;
  }

  function resetBonusTargets(stageNum: number) {
    const challenge = getBonusChallengeType(stageNum);
    cushionCount = 0;
    requiredCushions = getRequiredCushions(stageNum);
    billiardEndsAt = 0;
    vaultTouchId = null;
    vaultSequenceIndex = 0;
    if (challenge === 'billiard') {
      billiardObjects = createBilliardObjectBalls(stageNum);
      bonusCollectibles = [];
      vaultTargets = [];
      vaultSequence = [];
    } else if (challenge === 'movers') {
      billiardObjects = createMovingObjectBalls(stageNum);
      bonusCollectibles = [];
      vaultTargets = [];
      vaultSequence = [];
      requiredCushions = 0;
    } else if (challenge === 'flies') {
      billiardObjects = [];
      bonusCollectibles = [];
      fallingFlies = [];
      fliesCaught = 0;
      flySeq = 0;
      lastFlySpawnAt = 0;
      lasers = [];
      vaultTargets = [];
      vaultSequence = [];
    } else if (challenge === 'stars') {
      billiardObjects = [];
      bonusCollectibles = createStarCollectibles(stageNum);
      vaultTargets = [];
      vaultSequence = [];
    } else if (challenge === 'spin') {
      billiardObjects = [];
      bonusCollectibles = [];
      fallingStars = [];
      starRainCaught = 0;
      starRainSeq = 0;
      lastStarSpawnAt = 0;
      vaultTargets = [];
      vaultSequence = [];
    } else if (challenge === 'gems') {
      billiardObjects = [];
      bonusCollectibles = createGemCollectibles(stageNum);
      vaultTargets = [];
      vaultSequence = [];
    } else if (challenge === 'golden') {
      billiardObjects = [];
      bonusCollectibles = createCoinCollectibles(stageNum);
      vaultTargets = [];
      vaultSequence = [];
    } else if (challenge === 'vault') {
      billiardObjects = [];
      bonusCollectibles = [];
      const puzzle = createVaultPuzzle(stageNum);
      vaultTargets = puzzle.targets;
      vaultSequence = puzzle.sequence;
      aimAngle = VAULT_AIM_ANGLE;
    } else {
      billiardObjects = [];
      bonusCollectibles = [];
      vaultTargets = [];
      vaultSequence = [];
    }
    bricks = createBonusIronBricks();
  }

  function prepareBallForStage(stageNum: number) {
    const config = getStageConfig(stageNum);
    if (config.kind === 'bonus') {
      paddle = createPaddle();
      bricks = [];
      resetBonusTargets(stageNum);
      balls = [createAimedBall(paddle, config.ballSpeed, aimAngle)];
    } else {
      billiardObjects = [];
      bonusCollectibles = [];
      vaultTargets = [];
      vaultSequence = [];
      vaultSequenceIndex = 0;
      cushionCount = 0;
      balls = [createBall(paddle, config.ballSpeed)];
    }
  }

  async function startGame() {
    if (stageClearTimeout) clearTimeout(stageClearTimeout);
    score = 0;
    lives = INITIAL_LIVES;
    resetRoundState();
    stage = START_STAGE;
    paddle = createPaddle();
    bricks = createBricks(stage);
    prepareBallForStage(stage);
    bonusStageScoreStart = score;
    ballLaunched = false;
    if (getStageConfig(stage).kind === 'bonus') {
      screen = 'bonusIntro';
    } else {
      screen = 'ready';
      await tick();
      initCanvasContext();
      startLoop();
    }
    if (isLoggedIn) void logGameStart();
  }

  function startStage(stageNum: number) {
    stage = stageNum;
    resetRoundState();
    paddle = createPaddle();
    bricks = createBricks(stage);
    prepareBallForStage(stage);
    bonusStageScoreStart = score;
    ballLaunched = false;
    if (getStageConfig(stageNum).kind === 'bonus') {
      screen = 'bonusIntro';
    } else {
      screen = 'ready';
    }
  }

  async function dismissBonusIntro() {
    if (screen !== 'bonusIntro') return;
    screen = 'ready';
    await tick();
    initCanvasContext();
    startLoop();
  }

  function launchBall() {
    if (ballLaunched) return;
    // 파리 잡기는 공 없이 시작 (ready 루프가 balls 비움)
    if (balls.length === 0 && bonusChallenge !== 'flies') return;
    if (isBonusStage) {
      const limit = getBonusAttemptLimit(bonusChallenge);
      if (bonusAttemptsUsed >= limit) return;
      bonusAttemptsUsed += 1;
      const config = getStageConfig(stage);
      if (bonusChallenge !== 'flies') {
        balls = [createAimedBall(paddle, config.ballSpeed, aimAngle)];
      }
      resetBonusTargets(stage);
      billiardEndsAt = Date.now() + getBonusTimeLimitMs(bonusChallenge);
      if (bonusChallenge === 'spin') {
        const now = Date.now();
        fallingStars = [
          createFallingStar(starRainSeq++),
          createFallingStar(starRainSeq++),
          createFallingStar(starRainSeq++)
        ];
        lastStarSpawnAt = now;
        starRainCaught = 0;
      } else if (bonusChallenge === 'flies') {
        const now = Date.now();
        balls = [];
        lasers = [];
        fallingFlies = [createFallingFly(flySeq++)];
        lastFlySpawnAt = now;
        lastLaserShotAt = now;
        fliesCaught = 0;
      }
    }
    ballLaunched = true;
    screen = 'playing';
  }

  function retryBonusAim() {
    const config = getStageConfig(stage);
    powerUps = [];
    lasers = [];
    activeEffects = createActiveEffects();
    bricks = [];
    paddle = createPaddle();
    resetBonusTargets(stage);
    balls = [createAimedBall(paddle, config.ballSpeed, aimAngle)];
    ballLaunched = false;
    screen = 'ready';
    const limit = getBonusAttemptLimit(getBonusChallengeType(stage));
    showEffectToast(`재조준! (${bonusAttemptsUsed}/${limit})`);
  }

  function skipBonusStage() {
    scheduleBonusFailPerformance();
  }

  function handleBonusMiss() {
    const limit = getBonusAttemptLimit(bonusChallenge);
    const result = resolveBonusMiss(bonusAttemptsUsed, limit);
    if (result === 'retry') {
      retryBonusAim();
      return;
    }
    ballLaunched = false;
    balls = [];
    lasers = [];
    fallingFlies = [];
    fallingStars = [];
    skipBonusStage();
  }

  /** 보너스 실패 — 플레이 점수 퍼포먼스 후 다음 스테이지 */
  function scheduleBonusFailPerformance() {
    screen = 'stageClear';
    const playScore = Math.max(0, score - bonusStageScoreStart);
    const perf = buildBonusClearPerformance({
      challenge: bonusChallenge,
      stage,
      playScore,
      attemptsUsed: bonusAttemptsUsed,
      starRainCaught,
      fliesCaught,
      cleared: false
    });
    bonusClearPerf = perf;
    bonusClearStartedAt = Date.now();
    showEffectToast('보너스 실패');
    if (stageClearTimeout) clearTimeout(stageClearTimeout);
    stageClearTimeout = setTimeout(() => {
      bonusClearPerf = null;
      advanceStage();
    }, 3200);
  }

  function updateBilliardGame(now: number) {
    if (!ballLaunched) {
      balls = balls.map((b) => ({
        ...b,
        x: paddle.x + paddle.width / 2,
        y: paddle.y - b.radius - 2
      }));
      return;
    }

    if (getBilliardTimeLeftMs(billiardEndsAt, now) <= 0) {
      if (bonusChallenge === 'spin' || bonusChallenge === 'flies') {
        if (bonusChallenge === 'flies') {
          showEffectToast(`파리 ${fliesCaught}마리 격추!`);
        } else {
          showEffectToast(`별 ${starRainCaught}개 수집!`);
        }
        scheduleStageClear();
        return;
      }
      showEffectToast('시간 종료!');
      handleBonusMiss();
      return;
    }

    const config = getStageConfig(stage);

    if (bonusChallenge === 'flies') {
      if (now - lastLaserShotAt >= FLIES_LASER_INTERVAL_MS) {
        lasers = [...lasers, createLaserShot(paddle)];
        lastLaserShotAt = now;
      }
      lasers = moveLasers(lasers);
      if (lasers.length > 0) {
        const laserHit = handleLaserBrickCollision(lasers, bricks, stage);
        lasers = laserHit.lasers;
        bricks = laserHit.bricks;
      }

      const elapsed = FLIES_TIME_LIMIT_MS - getBilliardTimeLeftMs(billiardEndsAt, now);
      const diff = getFliesDifficulty(elapsed);
      if (shouldSpawnFly(lastFlySpawnAt, now, fallingFlies.length, diff.intervalMs, diff.maxActive)) {
        fallingFlies = [...fallingFlies, createFallingFly(flySeq++, Math.random, diff.fallScale)];
        lastFlySpawnAt = now;
      }

      const stepped = stepFallingFlies(fallingFlies);
      fallingFlies = stepped.flies;
      if (stepped.escaped) {
        showEffectToast('파리 놓침!');
        lasers = [];
        handleBonusMiss();
        return;
      }

      const hit = resolveLaserFlyHits(lasers, fallingFlies);
      lasers = hit.lasers;
      fallingFlies = hit.flies;
      for (const fly of hit.hitFlies) {
        fliesCaught += 1;
        const gained = getFlyHitScore(fly.value, stage);
        score += gained;
        showEffectToast(`🪰 ×${fliesCaught} +${gained}`);
      }
      balls = [];
      return;
    }

    let cue = balls[0] ?? createAimedBall(paddle, config.ballSpeed, aimAngle);
    cue = moveBall(cue);

    if (bonusChallenge === 'spin') {
      const sides = handleTopAndSideCushionCollision(cue);
      cue = sides.ball;
      const brickHit = handleBrickCollision(cue, bricks, stage);
      cue = brickHit.ball;
      bricks = brickHit.bricks;
      const paddleHit = handlePaddleCollision(cue, paddle);
      if (paddleHit.hit) {
        cue = paddleHit.ball;
      } else if (isBallLost(cue)) {
        showEffectToast('공 놓침!');
        handleBonusMiss();
        return;
      }

      if (shouldSpawnStarRain(lastStarSpawnAt, now, fallingStars.length)) {
        fallingStars = [...fallingStars, createFallingStar(starRainSeq++)];
        lastStarSpawnAt = now;
      }

      let nextStars = stepFallingStars(fallingStars).map((s) =>
        bounceFallingStarOffIron(s, bricks)
      );
      const kept: FallingStar[] = [];
      for (const star of nextStars) {
        if (tryCollectFallingStarWithPaddle(paddle, star)) {
          starRainCaught += 1;
          const gained = getStarPickupScore(star.value, stage);
          score += gained;
          showEffectToast(`⭐ ×${starRainCaught} +${gained}`);
        } else {
          kept.push(star);
        }
      }
      fallingStars = kept;
      balls = [normalizeBallSpeed(cue, config.ballSpeed)];
      return;
    }

    // 모든 보너스 흰공: 상·좌·우 쿠션 + 철 튕김 + 패들로 받기
    const wall = handleTopAndSideCushionCollision(cue);
    cue = wall.ball;
    if (wall.cushionHit) cushionCount += 1;
    const brickHit = handleBrickCollision(cue, bricks, stage);
    cue = brickHit.ball;
    bricks = brickHit.bricks;
    const paddleHit = handlePaddleCollision(cue, paddle);
    if (paddleHit.hit) {
      cue = paddleHit.ball;
    } else if (isBallLost(cue)) {
      showEffectToast('공 놓침!');
      handleBonusMiss();
      return;
    }

    if (bonusChallenge === 'billiard' || bonusChallenge === 'movers') {
      let nextObjects = billiardObjects;
      for (let i = 0; i < nextObjects.length; i++) {
        const result = resolveCueObjectHit(cue, nextObjects[i]);
        cue = result.cue;
        if (result.scored) {
          nextObjects = nextObjects.map((b, idx) => (idx === i ? result.obj : b));
          score += BILLIARD_HIT_SCORE * stage;
          showEffectToast(result.obj.kind === 'yellow' ? '노란공 적중!' : '빨간공 적중!');
        }
      }
      nextObjects =
        bonusChallenge === 'movers'
          ? nextObjects.map((b) => stepMovingObject(b))
          : nextObjects.map(stepBilliardObject);
      billiardObjects = nextObjects;
      balls = [normalizeBallSpeed(cue, config.ballSpeed)];
      const cleared =
        bonusChallenge === 'movers'
          ? isMoversClear(nextObjects)
          : isBilliardClear(cushionCount, requiredCushions, nextObjects);
      if (cleared) {
        scheduleStageClear();
      }
      return;
    }

    if (bonusChallenge === 'vault') {
      const overlapping = vaultTargets.find((t) => {
        if (t.activated) return false;
        return Math.hypot(t.x - cue.x, t.y - cue.y) < cue.radius + t.radius;
      });
      if (!overlapping) {
        vaultTouchId = null;
      } else if (vaultTouchId !== overlapping.id) {
        vaultTouchId = overlapping.id;
        const result = resolveVaultHit(
          vaultTargets,
          vaultSequence,
          vaultSequenceIndex,
          cue
        );
        vaultTargets = result.targets;
        vaultSequenceIndex = result.sequenceIndex;
        if (result.wrong) {
          showEffectToast('순서 틀림');
          balls = [normalizeBallSpeed(cue, config.ballSpeed)];
          handleBonusMiss();
          return;
        }
        if (result.correct) {
          score += 150 * stage;
          showEffectToast(
            result.complete
              ? '금고 개방!'
              : `다음: ${vaultSequence[result.sequenceIndex]}`
          );
        }
        if (result.complete) {
          balls = [normalizeBallSpeed(cue, config.ballSpeed)];
          scheduleStageClear();
          return;
        }
      }
      balls = [normalizeBallSpeed(cue, config.ballSpeed)];
      return;
    }

    // stars / gems / golden coins
    let nextItems = bonusCollectibles;
    for (let i = 0; i < nextItems.length; i++) {
      const result = tryCollectItem(cue, nextItems[i]);
      if (result.collected) {
        nextItems = nextItems.map((it, idx) => (idx === i ? result.item : it));
        if (bonusChallenge === 'gems' || bonusChallenge === 'golden') {
          const gained =
            bonusChallenge === 'golden'
              ? getCoinPickupScore(result.item.value, stage, cushionCount)
              : getGemPickupScore(result.item.value, stage, cushionCount);
          score += gained;
          const icon = bonusChallenge === 'golden' ? '🪙' : '💎';
          showEffectToast(`${icon} ×${getCushionMultiplier(Math.max(1, cushionCount))} +${gained}`);
        } else {
          const gained = getStarPickupScore(result.item.value, stage);
          score += gained;
          showEffectToast(`⭐ +${gained}`);
        }
      }
    }
    bonusCollectibles = nextItems;
    balls = [normalizeBallSpeed(cue, config.ballSpeed)];
    if (isCollectibleClear(nextItems)) {
      scheduleStageClear();
    }
  }

  function addScoreFromBricks(destroyed: Brick[], baseScore: number, now: number) {
    if (destroyed.length === 0) return;
    if (now - lastComboAt <= COMBO_WINDOW_MS) comboCount += destroyed.length;
    else comboCount = destroyed.length;
    lastComboAt = now;
    score += calculateComboBonus(comboCount, baseScore);
  }

  function appendDropsFromDestroyed(destroyed: Brick[], current: PowerUp[]): PowerUp[] {
    let next = current;
    for (const drop of createDropsFromDestroyedBricks(destroyed, stage)) {
      next = [...next, createPowerUpDrop(drop.brick, drop.type)];
    }
    return next;
  }

  function syncPaddleWidth() {
    const now = Date.now();
    const targetWidth = getEffectivePaddleWidth(activeEffects, now);
    if (Math.abs(paddle.width - targetWidth) > 0.5) {
      paddle = resizePaddle(paddle, targetWidth);
    }
  }

  function showEffectToast(message: string) {
    effectToast = message;
    effectToastUntil = Date.now() + 1800;
  }

  function applyCollectedPowerUp(type: PowerUpType) {
    const now = Date.now();
    const meta = POWER_UP_META[type];
    showEffectToast(meta.bad ? `⚠ ${meta.label}` : meta.label);

    switch (type) {
      case 'multiball': {
        activeEffects = applyTimedPowerUp('multiball', activeEffects, now);
        const config = getStageConfig(stage);
        const speed = getEffectiveBallSpeed(config.ballSpeed, activeEffects, now);
        const source = balls[0] ?? createBall(paddle, speed);
        balls = addMultiballBalls(balls, source, speed);
        break;
      }
      case 'extraLife':
        lives = Math.min(MAX_LIVES, lives + 1);
        break;
      case 'expand':
      case 'shrink':
      case 'slow':
      case 'fast':
      case 'invincible':
      case 'laser':
      case 'bigBall':
        activeEffects = applyTimedPowerUp(type, activeEffects, now);
        syncPaddleWidth();
        {
          const config = getStageConfig(stage);
          const speed = getEffectiveBallSpeed(config.ballSpeed, activeEffects, now);
          balls = normalizeAllBallSpeeds(syncBallRadii(balls, activeEffects, now), speed);
        }
        break;
      case 'shield':
        shieldCharges = Math.min(2, shieldCharges + 1);
        break;
      case 'bomb': {
        const blast = destroyAllBreakableBricks(bricks, stage);
        bricks = blast.bricks;
        addScoreFromBricks(blast.destroyed, blast.scoreGained, now);
        powerUps = appendDropsFromDestroyed(blast.destroyed, powerUps);
        if (isStageClear(bricks)) scheduleStageClear();
        break;
      }
      default:
        break;
    }
  }

  function initCanvasContext(): boolean {
    if (!canvasEl) return false;
    const context = canvasEl.getContext('2d');
    if (!context) return false;
    const dpr = window.devicePixelRatio || 1;
    canvasEl.width = CANVAS_WIDTH * dpr;
    canvasEl.height = CANVAS_HEIGHT * dpr;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx = context;
    return true;
  }

  function drawRoundRect(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) {
    context.beginPath();
    if (typeof context.roundRect === 'function') {
      context.roundRect(x, y, w, h, r);
    } else {
      context.rect(x, y, w, h);
    }
  }

  function loseLife() {
    const result = resolveLifeLoss(lives, shieldCharges);
    lives = result.lives;
    shieldCharges = result.shieldCharges;

    if (result.gameOver) {
      endGameOver();
      return;
    }

    const config = getStageConfig(stage);
    const ballSpeed = getEffectiveBallSpeed(config.ballSpeed, activeEffects, Date.now());

    if (result.shieldUsed) {
      showEffectToast('보호막 발동!');
      balls = [createBall(paddle, ballSpeed)];
      ballLaunched = false;
      screen = 'ready';
      return;
    }

    activeEffects = createActiveEffects();
    powerUps = [];
    paddle = createPaddle();
    balls = [createBall(paddle, ballSpeed)];
    ballLaunched = false;
    screen = 'ready';
  }

  function endGameOver() {
    if (stageClearTimeout) {
      clearTimeout(stageClearTimeout);
      stageClearTimeout = null;
    }
    stopLoop();
    ballLaunched = false;
    balls = [];
    screen = 'gameOver';
    if (isLoggedIn) void submitGameScore(score, stage);
  }

  function advanceStage() {
    const nextStage = getNextStage(stage);
    if (isGameComplete(nextStage)) {
      stopLoop();
      screen = 'gameWin';
      if (isLoggedIn) void submitGameScore(score, BONUS_ONLY_TEST ? BONUS_STAGE_LIST.length : STAGES.length, true);
      return;
    }
    startStage(nextStage);
  }

  function scheduleStageClear() {
    screen = 'stageClear';
    const playScore = Math.max(0, score - bonusStageScoreStart);
    let clearBonus = getStageClearBonus(stage, isBonusStage ? bonusAttemptsUsed : 1);

    if (isBonusStage) {
      const perf = buildBonusClearPerformance({
        challenge: bonusChallenge,
        stage,
        playScore,
        attemptsUsed: bonusAttemptsUsed,
        starRainCaught,
        fliesCaught
      });
      bonusClearPerf = perf;
      bonusClearStartedAt = Date.now();

      if (bonusAttemptsUsed <= 1) {
        score += playScore;
        clearBonus = getStageClearBonus(stage, 1);
      }
      score += clearBonus;
      showEffectToast(`${perf.grade} ${perf.gradeLabel}`);
    } else {
      bonusClearPerf = null;
      showEffectToast(`스테이지 클리어 +${clearBonus}`);
      score += clearBonus;
    }

    if (stageClearTimeout) clearTimeout(stageClearTimeout);
    const holdMs = isBonusStage ? 3200 : 1500;
    stageClearTimeout = setTimeout(() => {
      bonusClearPerf = null;
      advanceStage();
    }, holdMs);
  }

  function updateGame() {
    if (screen !== 'playing' && screen !== 'ready') return;
    if (lives <= 0) {
      endGameOver();
      return;
    }

    const now = Date.now();
    if (effectToast && now > effectToastUntil) effectToast = null;

    syncPaddleWidth();
    balls = syncBallRadii(balls, activeEffects, now);

    if (isBonusStage && !ballLaunched) {
      if (bonusChallenge === 'flies') {
        if (keys.left) paddle = movePaddle(paddle, -PADDLE_SPEED);
        if (keys.right) paddle = movePaddle(paddle, PADDLE_SPEED);
        balls = [];
      } else {
        if (keys.left) aimAngle = clampAimAngle(aimAngle + AIM_ANGLE_STEP);
        if (keys.right) aimAngle = clampAimAngle(aimAngle - AIM_ANGLE_STEP);
        balls = [createAimedBall(paddle, getStageConfig(stage).ballSpeed, aimAngle)];
      }
    } else if (!isBonusStage || ballLaunched) {
      if (keys.left) paddle = movePaddle(paddle, -PADDLE_SPEED);
      if (keys.right) paddle = movePaddle(paddle, PADDLE_SPEED);
    }

    if (isBonusStage) {
      updateBilliardGame(now);
      return;
    }

    powerUps = movePowerUps(powerUps);
    lasers = moveLasers(lasers);

    let nextPowerUps = powerUps;

    if (isLaserActive(activeEffects, now) && now - lastLaserShotAt >= LASER_INTERVAL_MS) {
      lasers = [...lasers, createLaserShot(paddle)];
      lastLaserShotAt = now;
    }

    if (lasers.length > 0) {
      const laserHit = handleLaserBrickCollision(lasers, bricks, stage);
      lasers = laserHit.lasers;
      bricks = laserHit.bricks;
      addScoreFromBricks(laserHit.destroyedBricks, laserHit.scoreGained, now);
      nextPowerUps = appendDropsFromDestroyed(laserHit.destroyedBricks, nextPowerUps);
    }

    if (!ballLaunched) {
      balls = balls.map((b) => ({
        ...b,
        x: paddle.x + paddle.width / 2,
        y: paddle.y - b.radius - 2
      }));
      powerUps = nextPowerUps;
      if (isStageClear(bricks)) scheduleStageClear();
      return;
    }

    const config = getStageConfig(stage);
    const ballSpeed = getEffectiveBallSpeed(config.ballSpeed, activeEffects, now);
    const invincible = isInvincibleBallActive(activeEffects, now);

    let nextBricks = bricks;
    const survivingBalls: Ball[] = [];
    const paddleHitBalls: Ball[] = [];
    const multiballGrow = isMultiballGrowActive(activeEffects, now);

    for (const ball of balls) {
      let nextBall = moveBall(ball);
      nextBall = handleWallCollision(nextBall);

      const paddleHit = handlePaddleCollision(nextBall, paddle);
      nextBall = paddleHit.ball;
      if (paddleHit.hit) {
        nextBall = resetBigBallPierce(nextBall);
        paddleHitBalls.push(nextBall);
      }

      if (invincible) {
        const pierce = handleInvincibleBrickCollision(nextBall, nextBricks, stage);
        nextBricks = pierce.bricks;
        addScoreFromBricks(pierce.destroyedBricks, pierce.scoreGained, now);
        nextPowerUps = appendDropsFromDestroyed(pierce.destroyedBricks, nextPowerUps);
      } else {
        const brickHit = handleBrickCollision(nextBall, nextBricks, stage);
        nextBall = brickHit.ball;
        if (brickHit.hit) {
          nextBricks = brickHit.bricks;
          addScoreFromBricks(brickHit.destroyedBricks, brickHit.scoreGained, now);
          nextPowerUps = appendDropsFromDestroyed(brickHit.destroyedBricks, nextPowerUps);
        }
      }

      nextBall = normalizeBallSpeed(nextBall, ballSpeed);
      if (!isBallLost(nextBall)) survivingBalls.push(nextBall);
    }

    bricks = nextBricks;
    const collected = handlePowerUpPaddleCollision(nextPowerUps, paddle);
    powerUps = collected.powerUps;

    // 생존 공 먼저 반영 후 파워업 — 멀티볼이 survivingBalls에 덮이지 않게
    balls = survivingBalls;
    if (multiballGrow) {
      for (const hitBall of paddleHitBalls) {
        balls = growBallsOnPaddleHit(balls, hitBall, ballSpeed);
      }
    }
    for (const item of collected.collected) {
      applyCollectedPowerUp(item.type);
    }

    if (balls.length === 0) {
      if (isBonusStage) {
        handleBonusMiss();
      } else {
        loseLife();
      }
      return;
    }

    if (isStageClear(bricks)) {
      scheduleStageClear();
    }
  }

  function drawGame() {
    if (!ctx) return;
    const now = Date.now();
    const invincible = isInvincibleBallActive(activeEffects, now);
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    if (isBonusStage) {
      const felt = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      felt.addColorStop(0, '#1b5e20');
      felt.addColorStop(1, '#0d3b12');
      ctx.fillStyle = felt;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 4;
      ctx.strokeRect(6, 52, CANVAS_WIDTH - 12, CANVAS_HEIGHT - 80);
    } else {
      const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      gradient.addColorStop(0, '#1a1a2e');
      gradient.addColorStop(1, '#16213e');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    if (!isBonusStage) {
    for (const brick of bricks) {
      if (!brick.alive) continue;
      ctx.fillStyle = brick.color;
      drawRoundRect(ctx, brick.x, brick.y, brick.width, brick.height, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (brick.type === 'strong' && brick.hits > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(brick.x + 2, brick.y + brick.height / 2 - 1, brick.width - 4, 2);
      }
      if (brick.type === 'explosive') {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('💥', brick.x + brick.width / 2, brick.y + brick.height / 2 + 4);
      }
      if (brick.type === 'iron') {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.moveTo(brick.x + 4, brick.y + 4);
        ctx.lineTo(brick.x + brick.width - 4, brick.y + brick.height - 4);
        ctx.moveTo(brick.x + brick.width - 4, brick.y + 4);
        ctx.lineTo(brick.x + 4, brick.y + brick.height - 4);
        ctx.stroke();
      }
      if (brick.type === 'rainbow') {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🌈', brick.x + brick.width / 2, brick.y + brick.height / 2 + 4);
      }
    }

    for (const laser of lasers) {
      if (!laser.alive) continue;
      ctx.strokeStyle = '#ff5252';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(laser.x, laser.y + 10);
      ctx.lineTo(laser.x, laser.y - 10);
      ctx.stroke();
    }

    for (const item of powerUps) {
      if (!item.alive) continue;
      const meta = POWER_UP_META[item.type];
      ctx.fillStyle = meta.color;
      drawRoundRect(ctx, item.x, item.y, item.width, item.height, 5);
      ctx.fill();
      ctx.strokeStyle = meta.bad ? '#c62828' : '#ffffff';
      ctx.lineWidth = meta.bad ? 2 : 1;
      ctx.stroke();
      ctx.fillStyle = meta.bad ? '#5d0000' : '#1a237e';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(meta.symbol, item.x + item.width / 2, item.y + item.height / 2 + 3);
    }
    } else {
      for (const brick of bricks) {
        if (!brick.alive) continue;
        ctx.fillStyle = brick.color;
        drawRoundRect(ctx, brick.x, brick.y, brick.width, brick.height, 4);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 1;
        ctx.stroke();
        if (brick.type === 'iron') {
          ctx.beginPath();
          ctx.moveTo(brick.x + 4, brick.y + 4);
          ctx.lineTo(brick.x + brick.width - 4, brick.y + brick.height - 4);
          ctx.moveTo(brick.x + brick.width - 4, brick.y + 4);
          ctx.lineTo(brick.x + 4, brick.y + brick.height - 4);
          ctx.stroke();
        }
      }
      for (const obj of billiardObjects) {
        ctx.globalAlpha = obj.hit ? 0.35 : 1;
        ctx.fillStyle = obj.color;
        ctx.beginPath();
        ctx.arc(obj.x, obj.y, obj.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = obj.hit ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 2;
        ctx.stroke();
        if (obj.hit) {
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.font = 'bold 12px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('✓', obj.x, obj.y + 4);
        }
        ctx.globalAlpha = 1;
      }
      for (const item of bonusCollectibles) {
        if (item.collected) {
          ctx.globalAlpha = 0.25;
        }
        if (item.kind === 'star') {
          ctx.fillStyle = '#ffd54f';
          ctx.font = 'bold 22px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('⭐', item.x, item.y + 7);
        } else if (item.kind === 'coin') {
          ctx.fillStyle = '#ffc107';
          ctx.beginPath();
          ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ff8f00';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = '#5d4037';
          ctx.font = 'bold 11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('₩', item.x, item.y + 4);
        } else {
          ctx.fillStyle = '#80d8ff';
          ctx.beginPath();
          ctx.moveTo(item.x, item.y - item.radius);
          ctx.lineTo(item.x + item.radius, item.y);
          ctx.lineTo(item.x, item.y + item.radius);
          ctx.lineTo(item.x - item.radius, item.y);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      for (const star of fallingStars) {
        ctx.fillStyle = '#ffd54f';
        ctx.font = 'bold 22px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⭐', star.x, star.y + 7);
      }
      for (const fly of fallingFlies) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🪰', fly.x, fly.y + 10);
      }
      if (bonusChallenge === 'flies') {
        for (const laser of lasers) {
          if (!laser.alive) continue;
          ctx.strokeStyle = '#ff5252';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(laser.x, laser.y + 10);
          ctx.lineTo(laser.x, laser.y - 10);
          ctx.stroke();
        }
      }
      for (const t of vaultTargets) {
        ctx.fillStyle = t.activated ? '#66bb6a' : '#455a64';
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = t.activated ? '#c8e6c9' : '#ffd54f';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(t.number), t.x, t.y + 5);
      }
    }

    // 보너스도 패들 항상 표시 (공 받기)
    {
      if (!isBonusStage && shieldCharges > 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(128, 203, 196, 0.85)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(
          paddle.x + paddle.width / 2,
          paddle.y + paddle.height / 2,
          paddle.width / 2 + 10,
          paddle.height + 10,
          0,
          Math.PI,
          Math.PI * 2
        );
        ctx.stroke();
        ctx.restore();
      }
      const paddleColor =
        activeEffects.shrinkPaddleUntil > now
          ? '#ffccbc'
          : activeEffects.expandPaddleUntil > now
            ? '#c8e6c9'
            : isBonusStage
              ? '#90caf9'
              : '#e0e0e0';
      ctx.fillStyle = paddleColor;
      drawRoundRect(ctx, paddle.x, paddle.y, paddle.width, paddle.height, 6);
      ctx.fill();
      ctx.strokeStyle =
        !isBonusStage && shieldCharges > 0
          ? '#80cbc4'
          : isBonusStage
            ? '#e3f2fd'
            : '#90caf9';
      ctx.lineWidth = !isBonusStage && shieldCharges > 0 ? 3 : 2;
      ctx.stroke();
    }

    for (const ball of balls) {
      if (bonusChallenge === 'flies') break;
      if (!isBonusStage && invincible) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#ffeb3b';
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius + 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      const ballGrad = ctx.createRadialGradient(
        ball.x - 2,
        ball.y - 2,
        1,
        ball.x,
        ball.y,
        ball.radius
      );
      ballGrad.addColorStop(0, '#ffffff');
      ballGrad.addColorStop(
        1,
        isBonusStage
          ? '#eceff1'
          : invincible
            ? '#ffb300'
            : activeEffects.bigBallUntil > now
              ? '#9575cd'
              : activeEffects.fastBallsUntil > now
                ? '#ef5350'
                : '#64b5f6'
      );
      ctx.fillStyle = ballGrad;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fill();
      if (isBonusStage) {
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`점수 ${score}`, 12, 24);
    ctx.fillText(`스테이지 ${stage}`, 12, 44);
    ctx.textAlign = 'right';
    ctx.fillText(`❤️ ${lives}`, CANVAS_WIDTH - 12, 24);
    if (!isBonusStage && balls.length > 1) {
      ctx.fillText(`● ${balls.length}`, CANVAS_WIDTH - 12, 44);
    }
    ctx.textAlign = 'center';
    ctx.font = '12px system-ui, sans-serif';
    if (stageConfig.kind === 'bonus') {
      const icon =
        bonusChallenge === 'stars' || bonusChallenge === 'spin'
          ? '⭐'
          : bonusChallenge === 'gems'
            ? '💎'
            : bonusChallenge === 'golden'
              ? '🪙'
              : bonusChallenge === 'vault'
                ? '🔐'
                : bonusChallenge === 'movers'
                  ? '🔵'
                  : bonusChallenge === 'flies'
                    ? '🪰'
                    : '🎱';
      ctx.fillStyle = '#ffd54f';
      ctx.fillText(`${icon} ${stageConfig.label}`, CANVAS_WIDTH / 2, 28);
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = '#fff';
      const timeLeft = ballLaunched
        ? Math.ceil(getBilliardTimeLeftMs(billiardEndsAt, now) / 1000)
        : Math.ceil(getBonusTimeLimitMs(bonusChallenge) / 1000);
      const attemptLimit = getBonusAttemptLimit(bonusChallenge);
      if (bonusChallenge === 'billiard') {
        const hitCount = countHitBilliardBalls(billiardObjects);
        ctx.fillText(
          `쿠션 ${cushionCount}/${requiredCushions} · 공 ${hitCount}/${billiardObjects.length} · ${timeLeft}s`,
          CANVAS_WIDTH / 2,
          46
        );
      } else if (bonusChallenge === 'movers') {
        const hitCount = countHitBilliardBalls(billiardObjects);
        ctx.fillText(
          `이동공 ${hitCount}/${billiardObjects.length} · ${timeLeft}s`,
          CANVAS_WIDTH / 2,
          46
        );
      } else if (bonusChallenge === 'flies') {
        ctx.fillText(`격추 ${fliesCaught} · ${timeLeft}s`, CANVAS_WIDTH / 2, 46);
      } else if (bonusChallenge === 'spin') {
        ctx.fillText(`먹은 별 ${starRainCaught} · ${timeLeft}s`, CANVAS_WIDTH / 2, 46);
      } else if (bonusChallenge === 'stars') {
        ctx.fillText(
          `별 ${countCollectedItems(bonusCollectibles)}/${bonusCollectibles.length} · ${timeLeft}s`,
          CANVAS_WIDTH / 2,
          46
        );
      } else if (bonusChallenge === 'gems') {
        ctx.fillText(
          `보석 ${countCollectedItems(bonusCollectibles)}/${bonusCollectibles.length} · 배율 ×${getCushionMultiplier(cushionCount)} · ${timeLeft}s`,
          CANVAS_WIDTH / 2,
          46
        );
      } else if (bonusChallenge === 'golden') {
        ctx.fillText(
          `코인 ${countCollectedItems(bonusCollectibles)}/${bonusCollectibles.length} · ×${getCushionMultiplier(Math.max(1, cushionCount))} · ${timeLeft}s`,
          CANVAS_WIDTH / 2,
          46
        );
      } else {
        const seqLabel = vaultSequence
          .map((n, i) => (i < vaultSequenceIndex ? `✓${n}` : String(n)))
          .join('→');
        ctx.fillText(`순서 ${seqLabel} · ${timeLeft}s`, CANVAS_WIDTH / 2, 46);
      }
      ctx.fillStyle = '#c8e6c9';
      ctx.fillText(
        bonusChallenge === 'golden' || bonusChallenge === 'flies'
          ? '원샷!'
          : `기회 ${Math.max(0, attemptLimit - bonusAttemptsUsed)}/${attemptLimit}`,
        CANVAS_WIDTH / 2,
        62
      );
    } else if (stageConfig.kind === 'theme') {
      ctx.fillStyle = '#80cbc4';
      ctx.fillText(stageConfig.label, CANVAS_WIDTH / 2, 44);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(stageConfig.label, CANVAS_WIDTH / 2, 44);
    }

    if (!isBonusStage && comboCount > 1) {
      ctx.fillText(`콤보 x${comboCount}`, CANVAS_WIDTH / 2, 80);
    }

    const activeEffectLabels = getActiveEffectLabels(activeEffects, now, shieldCharges);

    if (!isBonusStage && activeEffectLabels.length > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(activeEffectLabels.join(' · '), CANVAS_WIDTH / 2, 62);
    }

    if (effectToast) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(CANVAS_WIDTH / 2 - 90, CANVAS_HEIGHT - 88, 180, 28);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(effectToast, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 70);
    }

    if (screen === 'ready') {
      if (isBonusStage && bonusChallenge === 'flies') {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, CANVAS_HEIGHT / 2 - 36, CANVAS_WIDTH, 72);
        ctx.fillStyle = '#ffd54f';
        ctx.font = 'bold 16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('초반 1마리 · 점점 늘어남', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 8);
        ctx.fillStyle = '#fff';
        ctx.font = '13px system-ui, sans-serif';
        ctx.fillText(
          `원샷 · ${Math.ceil(getBonusTimeLimitMs('flies') / 1000)}초 버티기`,
          CANVAS_WIDTH / 2,
          CANVAS_HEIGHT / 2 + 18
        );
      } else if (isBonusStage) {
        const originX = paddle.x + paddle.width / 2;
        const originY = paddle.y - BALL_RADIUS - 2;
        const tip = getAimLineEnd(originX, originY, aimAngle);
        ctx.strokeStyle = 'rgba(255, 213, 79, 0.85)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(originX, originY);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffd54f';
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, CANVAS_HEIGHT / 2 - 36, CANVAS_WIDTH, 72);
        ctx.fillStyle = '#ffd54f';
        ctx.font = 'bold 16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        const aimHint =
          bonusChallenge === 'stars'
            ? '각도 조준 · 모든 별 먹기'
            : bonusChallenge === 'spin'
              ? '패들로 별 받기 · 공 유지 · 철 피하기'
              : bonusChallenge === 'movers'
                ? '움직이는 공 전부 맞추기'
                : bonusChallenge === 'gems'
                  ? '쿠션 쌓고 보석 먹기 (배율↑)'
                  : bonusChallenge === 'golden'
                    ? '원샷! 쿠션 후 코인 최대 회수'
                    : bonusChallenge === 'vault'
                      ? `뱅크샷 순서: ${vaultSequence.join('→')}`
                      : '각도 조준 · 쿠션 후 모든 공 맞추기';
        ctx.fillText(aimHint, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 8);
        ctx.fillStyle = '#fff';
        ctx.font = '13px system-ui, sans-serif';
        const limit = getBonusAttemptLimit(bonusChallenge);
        const left = limit - bonusAttemptsUsed;
        ctx.fillText(
          bonusChallenge === 'golden'
            ? `단 1발 · 1발 클리어 ×${getBonusShotClearMultiplier(1)}`
            : bonusChallenge === 'spin'
              ? `원샷 · 공 유지 · ${Math.ceil(getBonusTimeLimitMs('spin') / 1000)}초`
              : `남은 기회 ${left}회 · 1발 클리어 ×${getBonusShotClearMultiplier(bonusAttemptsUsed + 1)}`,
          CANVAS_WIDTH / 2,
          CANVAS_HEIGHT / 2 + 18
        );
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 18px system-ui, sans-serif';
        ctx.fillText('아래 바 드래그 · 탭하면 발사', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      }
    }

    if (screen === 'paused') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.fillText('일시정지', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    }

    if (screen === 'stageClear') {
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      if (isBonusStage && bonusClearPerf) {
        const elapsed = now - bonusClearStartedAt;
        const perf = bonusClearPerf;
        const cx = CANVAS_WIDTH / 2;

        ctx.fillStyle = perf.cleared ? '#ffd54f' : '#ef9a9a';
        ctx.font = 'bold 22px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(perf.title, cx, 150);

        if (bonusChallenge === 'spin' && starRainCaught > 0) {
          ctx.fillStyle = '#fff9c4';
          ctx.font = '13px system-ui, sans-serif';
          ctx.fillText(`먹은 별 ${starRainCaught}개`, cx, 178);
        }
        if (bonusChallenge === 'flies' && fliesCaught > 0) {
          ctx.fillStyle = '#fff9c4';
          ctx.font = '13px system-ui, sans-serif';
          ctx.fillText(`격추 ${fliesCaught}마리`, cx, 178);
        }

        let lineY = 220;
        ctx.font = '15px system-ui, sans-serif';
        for (const line of perf.lines) {
          if (elapsed < line.delayMs) break;
          const isTotal = line.label === '합계';
          ctx.fillStyle = isTotal ? '#ffd54f' : '#ffffff';
          ctx.font = isTotal ? 'bold 17px system-ui, sans-serif' : '15px system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(line.label, 90, lineY);
          ctx.textAlign = 'right';
          const sign = line.value >= 0 ? '+' : '';
          ctx.fillText(`${sign}${line.value}`, CANVAS_WIDTH - 90, lineY);
          if (isTotal) {
            ctx.strokeStyle = 'rgba(255,213,79,0.45)';
            ctx.beginPath();
            ctx.moveTo(90, lineY - 22);
            ctx.lineTo(CANVAS_WIDTH - 90, lineY - 22);
            ctx.stroke();
          }
          lineY += isTotal ? 36 : 30;
        }

        const gradeDelay = (perf.lines[perf.lines.length - 1]?.delayMs ?? 1200) + 400;
        if (elapsed >= gradeDelay) {
          const gradeColor =
            perf.grade === 'S'
              ? '#ffeb3b'
              : perf.grade === 'A'
                ? '#81d4fa'
                : perf.grade === 'B'
                  ? '#a5d6a7'
                  : '#b0bec5';
          ctx.fillStyle = gradeColor;
          ctx.font = 'bold 48px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(perf.grade, cx, lineY + 50);
          ctx.font = 'bold 14px system-ui, sans-serif';
          ctx.fillText(perf.gradeLabel, cx, lineY + 78);
          if (perf.cleared && perf.shotMultiplier > 1) {
            ctx.fillStyle = '#ffe082';
            ctx.font = '12px system-ui, sans-serif';
            ctx.fillText('1발 클리어 보너스 적용', cx, lineY + 100);
          } else if (!perf.cleared) {
            ctx.fillStyle = '#ef9a9a';
            ctx.font = '12px system-ui, sans-serif';
            ctx.fillText('클리어 실패 · 플레이 점수만 반영', cx, lineY + 100);
          }
        }
      } else {
        ctx.fillStyle = '#ffd54f';
        ctx.font = 'bold 22px system-ui, sans-serif';
        ctx.textAlign = 'center';
        const clearLabel =
          stageConfig.kind === 'bonus'
            ? bonusChallenge === 'stars'
              ? '⭐ 별 전부 클리어!'
              : bonusChallenge === 'spin'
                ? '⭐ 별 소나기 클리어!'
                : bonusChallenge === 'flies'
                  ? '🪰 파리 잡기 클리어!'
                  : bonusChallenge === 'movers'
                    ? '🔵 이동 공 클리어!'
                    : bonusChallenge === 'gems'
                      ? '💎 보석 회수 클리어!'
                      : bonusChallenge === 'golden'
                        ? '🪙 골든샷 클리어!'
                        : bonusChallenge === 'vault'
                          ? '🔐 금고 개방!'
                          : '🎱 당구 챌린지 클리어!'
            : `스테이지 ${stage} 클리어!`;
        ctx.fillText(clearLabel, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      }
    }
  }

  function gameLoop() {
    if (!shouldContinueGameLoop(screen)) {
      frameId = 0;
      return;
    }
    updateGame();
    drawGame();
    if (shouldContinueGameLoop(screen)) {
      frameId = requestAnimationFrame(gameLoop);
    } else {
      frameId = 0;
    }
  }

  function startLoop() {
    stopLoop();
    frameId = requestAnimationFrame(gameLoop);
  }

  function stopLoop() {
    if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
  }

  function pauseGame() {
    if (screen !== 'playing' && screen !== 'ready') return;
    screen = 'paused';
  }

  function resumeGame() {
    if (screen !== 'paused') return;
    screen = ballLaunched ? 'playing' : 'ready';
  }

  function togglePause() {
    if (screen === 'playing' || screen === 'ready') pauseGame();
    else if (screen === 'paused') resumeGame();
  }

  function goToMenu() {
    stopLoop();
    if (stageClearTimeout) {
      clearTimeout(stageClearTimeout);
      stageClearTimeout = null;
    }
    screen = 'menu';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys = { ...keys, left: true };
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys = { ...keys, right: true };
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (screen === 'menu') return;
      if (screen === 'bonusIntro') void dismissBonusIntro();
      else if (screen === 'ready') launchBall();
      else if (screen === 'playing') togglePause();
      else if (screen === 'paused') resumeGame();
    }
    if (e.key === 'Escape') {
      if (screen === 'playing' || screen === 'ready') pauseGame();
      else if (screen === 'paused') goToMenu();
    }
  }

  function handleKeyup(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys = { ...keys, left: false };
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys = { ...keys, right: false };
  }

  function mapClientXToGameX(clientX: number): number {
    if (!dragBarEl) return CANVAS_WIDTH / 2;
    const rect = dragBarEl.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * CANVAS_WIDTH;
  }

  function setPaddleFromGameX(gameX: number) {
    const targetX = gameX - paddle.width / 2;
    const clamped = Math.max(0, Math.min(CANVAS_WIDTH - paddle.width, targetX));
    paddle = { ...paddle, x: clamped };
  }

  function setAimFromGameX(gameX: number) {
    const ratio = Math.max(0, Math.min(1, gameX / CANVAS_WIDTH));
    aimAngle = aimAngleFromDragRatio(ratio);
  }

  function handleDragBarPointerDown(e: PointerEvent) {
    if (screen !== 'playing' && screen !== 'ready' && screen !== 'paused') return;
    const el = e.currentTarget as HTMLElement;
    dragBarActive = true;
    dragStartX = e.clientX;
    dragMoved = false;
    if (screen !== 'paused') {
      const gameX = mapClientXToGameX(e.clientX);
      if (isBonusAiming) setAimFromGameX(gameX);
      else setPaddleFromGameX(gameX);
    }
    el.setPointerCapture(e.pointerId);
  }

  function handleDragBarPointerMove(e: PointerEvent) {
    if (!dragBarActive || screen === 'paused') return;
    if (Math.abs(e.clientX - dragStartX) > 8) dragMoved = true;
    const gameX = mapClientXToGameX(e.clientX);
    if (isBonusAiming) setAimFromGameX(gameX);
    else setPaddleFromGameX(gameX);
  }

  function handleDragBarPointerUp(e: PointerEvent) {
    if (!dragBarActive) return;
    const el = e.currentTarget as HTMLElement;
    dragBarActive = false;
    if (!dragMoved) {
      if (screen === 'ready') launchBall();
      else if (screen === 'paused') resumeGame();
    }
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  }

  async function loadRank() {
    rankLoading = true;
    try {
      const res = await fetch(`/games/breakout?rank=1&_=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const j = await res.json();
        rankList = j.rank ?? [];
        if (j.myBest && typeof j.myBest === 'object') {
          myBestScore = j.myBest.score != null ? Number(j.myBest.score) : null;
          myBestStage = j.myBest.stage != null ? Number(j.myBest.stage) : null;
          myBestCreatedAt = j.myBest.createdAt ?? null;
        } else {
          myBestScore = null;
          myBestStage = null;
          myBestCreatedAt = null;
        }
        if (
          j.todayStats &&
          typeof j.todayStats.games === 'number' &&
          typeof j.todayStats.users === 'number'
        ) {
          todayStats = { games: j.todayStats.games, users: j.todayStats.users };
        }
      }
    } catch {
      rankList = [];
      myBestScore = null;
      myBestStage = null;
      myBestCreatedAt = null;
      todayStats = { games: 0, users: 0 };
    } finally {
      rankLoading = false;
    }
  }

  async function logGameStart() {
    try {
      await fetch('/games/breakout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' })
      });
    } catch (err) {
      console.error('[breakout start log failed]', err);
    }
  }

  async function submitGameScore(finalScore: number, finalStage: number, win = false) {
    if (!isLoggedIn || finalScore <= 0) return;
    const scoreKey = `${finalScore}:${finalStage}:${win ? 'w' : ''}`;
    if (submittedScoreKey === scoreKey) return;
    submittedScoreKey = scoreKey;
    try {
      const res = await fetch('/games/breakout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: finalScore, stage: finalStage, ...(win ? { win: true } : {}) })
      });
      if (res.ok) await loadRank();
    } catch (err) {
      submittedScoreKey = null;
      console.error('[breakout score submit failed]', err);
    }
  }

  function submitScoreOnLeave() {
    if (!isLoggedIn || score <= 0) return;
    const scoreKey = `${score}:${stage}`;
    if (submittedScoreKey === scoreKey) return;
    submittedScoreKey = scoreKey;
    fetch('/games/breakout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score, stage }),
      keepalive: true
    }).catch((err) => {
      submittedScoreKey = null;
      console.error('[breakout leave score submit failed]', err);
    });
  }

  function formatScore(n: number): string {
    return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n);
  }

  onMount(() => {
    const handleBeforeUnload = () => submitScoreOnLeave();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') submitScoreOnLeave();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      submitScoreOnLeave();
      stopLoop();
      if (stageClearTimeout) clearTimeout(stageClearTimeout);
    };
  });

  beforeNavigate(() => {
    submitScoreOnLeave();
  });

  $effect(() => {
    if (canvasEl) initCanvasContext();
    else ctx = null;
  });

  $effect(() => {
    if (isLoggedIn) loadRank();
  });
</script>

<svelte:window onkeydown={handleKeydown} onkeyup={handleKeyup} />

<svelte:head>
  <title>블록깨기 | dgst.me</title>
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
  />
</svelte:head>

<div class="breakout-page container py-3 py-md-4">
  <div class="row justify-content-center g-3">
    <div class="col-12 col-md-8 col-lg-7 col-xl-6">
      <div class="card shadow rounded-4 breakout-card">
        <div class="card-body p-3 p-md-4">
          {#if screen === 'menu'}
            <div class="text-center py-3">
              <h2 class="mb-2">🎯 블록깨기</h2>
              <p class="text-muted mb-4 small">
                패들로 공 받기 · 블록 제거 · 아이템 획득<br />
                🟦일반 🟥내구(2타) 🟨폭발 ⬛철(무적) 🌈특수<br />
                {START_STAGE > 1
                  ? `🧪 ${START_STAGE}단계부터 시작 · 테스트`
                  : BONUS_ONLY_TEST
                    ? `🧪 보너스만 테스트 · ${BONUS_STAGE_LIST.length}스테이지`
                    : '50단계 · 테마 · 당구 퍼즐 스테이지 포함'}
              </p>
              <button type="button" class="btn btn-primary btn-lg px-5" onclick={startGame}>
                시작
              </button>
              <div class="mt-3 small text-muted">
                키보드 ← → 이동 · 아래 바 드래그/탭 · 스페이스 발사
              </div>
            </div>
          {:else if screen === 'gameOver'}
            <div class="text-center py-3">
              <h2 class="mb-2 text-danger">게임 오버</h2>
              <p class="mb-1">최종 점수: <strong>{formatScore(score)}</strong></p>
              <p class="text-muted mb-4">스테이지 {stage} · {stageConfig.label}</p>
              <button type="button" class="btn btn-primary me-2" onclick={startGame}>
                다시 하기
              </button>
              <button type="button" class="btn btn-outline-secondary" onclick={goToMenu}>
                메뉴
              </button>
            </div>
          {:else if screen === 'gameWin'}
            <div class="text-center py-3">
              <h2 class="mb-2 text-success">🎉 전체 클리어!</h2>
              <p class="mb-1">최종 점수: <strong>{formatScore(score)}</strong></p>
              <p class="text-muted mb-4">
                {BONUS_ONLY_TEST
                  ? `보너스 ${BONUS_STAGE_LIST.length}개 모두 클리어!`
                  : `${STAGES.length}단계 모두 클리어했습니다!`}
              </p>
              <button type="button" class="btn btn-primary me-2" onclick={startGame}>
                다시 하기
              </button>
              <button type="button" class="btn btn-outline-secondary" onclick={goToMenu}>
                메뉴
              </button>
            </div>
          {:else if screen === 'bonusIntro'}
            <div class="text-center py-3 bonus-intro">
              <h2 class="mb-2 text-warning">
                {bonusChallenge === 'stars'
                  ? '⭐'
                  : bonusChallenge === 'spin'
                    ? '⭐'
                    : bonusChallenge === 'flies'
                      ? '🪰'
                      : bonusChallenge === 'movers'
                        ? '🔵'
                        : bonusChallenge === 'gems'
                          ? '💎'
                          : bonusChallenge === 'golden'
                            ? '🪙'
                            : bonusChallenge === 'vault'
                              ? '🔐'
                              : '🎱'}
                {stageConfig.label} · {stage}단계
              </h2>
              {#if bonusChallenge === 'stars'}
                <p class="text-muted mb-3 small">쿠션을 이용해 떠 있는 별을 모두 먹으세요</p>
                <ul class="list-unstyled text-start mx-auto bonus-intro-rules mb-4">
                  <li>상·좌·우 쿠션 · <strong>패들로 공 받기</strong> · 철 1~2개 · {Math.ceil(BILLIARD_TIME_LIMIT_MS / 1000)}초</li>
                  <li>흰공으로 <strong>모든 ⭐</strong> 에 닿으면 클리어</li>
                  <li>드래그바 / ← → 로 발사 각도 조절</li>
                  <li>기회 {BONUS_MAX_ATTEMPTS}회 · 1발 클리어 시 점수 ×2</li>
                </ul>
              {:else if bonusChallenge === 'spin'}
                <p class="text-muted mb-3 small">쏟아지는 별을 패들로 먹고, 공은 떨어뜨리지 마세요</p>
                <ul class="list-unstyled text-start mx-auto bonus-intro-rules mb-4">
                  <li><strong>패들</strong>로 ⭐ 받기 · 공으로는 안 먹힘</li>
                  <li>중간 <strong>철 블록</strong> — 공만 튕김 · 별은 통과</li>
                  <li>공 놓치면 실패 · <strong>{Math.ceil(getBonusTimeLimitMs('spin') / 1000)}초</strong> 버티면 클리어</li>
                  <li><strong>원샷</strong> — 기회 1회 · 1발 클리어 시 점수 ×2</li>
                </ul>
              {:else if bonusChallenge === 'flies'}
                <p class="text-muted mb-3 small">떨어지는 파리를 레이저로 잡으세요. 하나라도 놓치면 끝!</p>
                <ul class="list-unstyled text-start mx-auto bonus-intro-rules mb-4">
                  <li>패들에서 <strong>레이저 자동 발사</strong></li>
                  <li>초반 1마리 → 점점 늘어남 (최대 4) · 바닥 통과 = 실패</li>
                  <li><strong>{Math.ceil(FLIES_TIME_LIMIT_MS / 1000)}초</strong> 버티면 클리어</li>
                  <li><strong>원샷</strong> — 기회 1회 · 1발 클리어 시 점수 ×2</li>
                </ul>
              {:else if bonusChallenge === 'movers'}
                <p class="text-muted mb-3 small">계속 움직이는 목표 공을 전부 맞추세요</p>
                <ul class="list-unstyled text-start mx-auto bonus-intro-rules mb-4">
                  <li>◎ 흰공 · ● 빨간 2 · ● 노란 1 — <strong>처음부터 이동</strong></li>
                  <li>쿠션 조건 없음 · 목표 공 전부 적중하면 클리어</li>
                  <li>상·좌·우 쿠션 · <strong>패들로 공 받기</strong> · 철 1~2개 · {Math.ceil(MOVERS_TIME_LIMIT_MS / 1000)}초</li>
                  <li>기회 {BONUS_MAX_ATTEMPTS}회 · 1발 클리어 시 점수 ×2</li>
                </ul>
              {:else if bonusChallenge === 'gems'}
                <p class="text-muted mb-3 small">쿠션을 쌓을수록 보석 점수 배율이 올라갑니다</p>
                <ul class="list-unstyled text-start mx-auto bonus-intro-rules mb-4">
                  <li>배율: 1쿠션×1 · 2×2 · 3×4 · 4×8 · 5+×16</li>
                  <li>쿠션 먼저 쌓고 <strong>💎 보석</strong> 먹기</li>
                  <li>모든 보석 회수 시 클리어 · 패들로 공 받기 · {Math.ceil(BILLIARD_TIME_LIMIT_MS / 1000)}초</li>
                  <li>기회 {BONUS_MAX_ATTEMPTS}회 · 1발 클리어 시 점수 ×2</li>
                </ul>
              {:else if bonusChallenge === 'golden'}
                <p class="text-muted mb-3 small">단 한 발! 쿠션 배율로 코인을 최대한 회수하세요</p>
                <ul class="list-unstyled text-start mx-auto bonus-intro-rules mb-4">
                  <li><strong>원샷</strong> — 기회 1회뿐</li>
                  <li>쿠션 쌓을수록 🪙 점수 배율 ↑</li>
                  <li>모든 코인 회수 시 클리어 · 패들로 공 받기 · {Math.ceil(BILLIARD_TIME_LIMIT_MS / 1000)}초</li>
                  <li>1발 클리어 시 점수 ×2</li>
                </ul>
              {:else if bonusChallenge === 'vault'}
                <p class="text-muted mb-3 small">뱅크샷으로 번호 순서대로 맞추면 금고가 열립니다</p>
                <ul class="list-unstyled text-start mx-auto bonus-intro-rules mb-4">
                  <li>순서: <strong>{vaultSequence.join(' → ')}</strong> (좌→상→우)</li>
                  <li>기회 {BONUS_MAX_ATTEMPTS}회 · <strong>1발 클리어 시 점수 ×2</strong></li>
                  <li>틀린 번호·시간 초과 시 재조준 (2발째는 ×1)</li>
                  <li>기본 각도 ≈ 왼쪽 위 · 패들로 공 받기 · {Math.ceil(BILLIARD_TIME_LIMIT_MS / 1000)}초</li>
                </ul>
              {:else}
                <p class="text-muted mb-3 small">4구 당구 — 쿠션을 이용해 모든 공을 맞추세요</p>
                <ul class="list-unstyled text-start mx-auto bonus-intro-rules mb-4">
                  <li>◎ 흰공 · ● 빨간 2 · ● 노란 1</li>
                  <li>쿠션 <strong>{getRequiredCushions(stage)}회 이상</strong> + 목표 공 전부 적중</li>
                  <li>상·좌·우 쿠션 · <strong>패들로 공 받기</strong> · 철 1~2개 · {Math.ceil(BILLIARD_TIME_LIMIT_MS / 1000)}초</li>
                  <li>기회 {BONUS_MAX_ATTEMPTS}회 · 1발 클리어 시 점수 ×2</li>
                </ul>
              {/if}
              <button type="button" class="btn btn-warning btn-lg px-5" onclick={dismissBonusIntro}>
                {bonusChallenge === 'flies' ? '시작' : '조준 시작'}
              </button>
              <div class="mt-3 small text-muted">스페이스 / Enter 로도 시작</div>
            </div>
          {:else}
            <div class="breakout-canvas-wrap">
              <canvas
                bind:this={canvasEl}
                class="breakout-canvas"
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                aria-label="블록깨기 게임"
              ></canvas>
            </div>
            <div
              class="breakout-drag-bar"
              bind:this={dragBarEl}
              role="slider"
              tabindex="0"
              aria-label="패들 조작 바"
              aria-valuemin={0}
              aria-valuemax={CANVAS_WIDTH}
              aria-valuenow={Math.round(paddle.x + paddle.width / 2)}
              onpointerdown={handleDragBarPointerDown}
              onpointermove={handleDragBarPointerMove}
              onpointerup={handleDragBarPointerUp}
              onpointercancel={handleDragBarPointerUp}
            >
              <div class="breakout-drag-track" aria-hidden="true"></div>
              <div
                class="breakout-drag-thumb"
                style="left: {dragThumbPercent}%"
                aria-hidden="true"
              ></div>
              <span class="breakout-drag-hint">
                {#if screen === 'ready' && isBonusStage && bonusChallenge === 'flies'}
                  드래그로 패들 · 탭하면 시작 (원샷)
                {:else if screen === 'playing' && isBonusStage && bonusChallenge === 'flies'}
                  레이저로 파리 격추 · 놓치면 끝
                {:else if screen === 'ready' && isBonusStage && bonusChallenge === 'spin'}
                  드래그로 각도 · 탭하면 발사 ({getBonusAttemptLimit(bonusChallenge) -
                    bonusAttemptsUsed}/{getBonusAttemptLimit(bonusChallenge)})
                {:else if screen === 'playing' && isBonusStage && bonusChallenge === 'spin'}
                  패들로 별 받기 · 공도 받기
                {:else if screen === 'ready' && isBonusStage}
                  드래그로 각도 · 탭하면 발사 ({getBonusAttemptLimit(bonusChallenge) -
                    bonusAttemptsUsed}/{getBonusAttemptLimit(bonusChallenge)})
                {:else if screen === 'ready'}
                  드래그로 이동 · 탭하면 발사
                {:else if screen === 'paused'}
                  탭하면 재개
                {:else}
                  드래그로 패들 이동
                {/if}
              </span>
            </div>
            <div class="d-flex justify-content-center gap-2 mt-3 flex-wrap">
              <button type="button" class="btn btn-sm btn-outline-secondary" onclick={togglePause}>
                {screen === 'paused' ? '재개' : '일시정지'}
              </button>
              <button type="button" class="btn btn-sm btn-outline-secondary" onclick={goToMenu}>
                메뉴
              </button>
            </div>
          {/if}
        </div>
      </div>

      {#if isLoggedIn}
        <div class="card shadow rounded-4 mt-3">
          <div class="card-body p-3">
            <h5 class="card-title mb-3">🏆 전체 기간 랭킹</h5>
            {#if rankLoading}
              <p class="text-muted small mb-0">불러오는 중...</p>
            {:else if rankList.length === 0}
              <p class="text-muted small mb-0">아직 기록이 없습니다.</p>
            {:else}
              <ol class="list-group list-group-numbered list-group-flush">
                {#each rankList as r, i (r._id ?? `${r.nickname}:${r.score}:${i}`)}
                  <li
                    class="list-group-item d-flex justify-content-between align-items-center px-0"
                  >
                    <span>
                      <strong>{r.nickname}</strong>
                      <span class="text-muted small ms-1">
                        S{r.stage ?? 0}
                        {#if r.createdAt}
                          · {formatRelativeTime(r.createdAt, { locale: ko })}
                        {/if}
                      </span>
                    </span>
                    <span class="badge bg-primary rounded-pill">{formatScore(r.score)}</span>
                  </li>
                {/each}
              </ol>
            {/if}
            {#if myBestScore != null}
              <p class="small text-muted mt-3 mb-0">
                내 최고: <strong>{formatScore(myBestScore)}</strong>
                {#if myBestStage}(S{myBestStage}){/if}
                {#if myBestCreatedAt}
                  · {formatRelativeTime(myBestCreatedAt, { locale: ko })}
                {/if}
              </p>
            {/if}
            <p class="small text-muted mt-2 mb-0">
              오늘 {todayStats.games}판 · {todayStats.users}명 참여
            </p>
          </div>
        </div>
      {:else}
        <div class="card shadow rounded-4 mt-3">
          <div class="card-body p-3 text-center">
            <p class="text-muted small mb-2">랭킹에 기록하려면 로그인이 필요합니다.</p>
            <a href={resolve('/login')} class="btn btn-sm btn-outline-primary">로그인</a>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .breakout-card {
    background: var(--dgst-chrome-bg, #fff);
    overflow: hidden;
  }

  .bonus-intro-rules {
    max-width: 320px;
    font-size: 0.95rem;
    line-height: 1.7;
  }

  .bonus-intro-rules li {
    padding: 0.2rem 0;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  }

  .bonus-intro-rules li:last-child {
    border-bottom: none;
  }

  .breakout-canvas-wrap {
    display: flex;
    justify-content: center;
    border-radius: 12px;
    overflow: hidden;
    background: #0f0f1a;
  }

  .breakout-canvas {
    display: block;
    width: 100%;
    max-width: 480px;
    height: auto;
    aspect-ratio: 480 / 640;
    touch-action: none;
    pointer-events: none;
    user-select: none;
  }

  .breakout-drag-bar {
    position: relative;
    width: 100%;
    max-width: 480px;
    margin: 0.75rem auto 0;
    height: 88px;
    border-radius: 16px;
    background: #1a1a2e;
    border: 1px solid rgba(144, 202, 249, 0.35);
    touch-action: none;
    user-select: none;
    cursor: grab;
    overflow: hidden;
  }

  .breakout-drag-bar:active {
    cursor: grabbing;
  }

  .breakout-drag-track {
    position: absolute;
    left: 16px;
    right: 16px;
    top: 50%;
    height: 10px;
    transform: translateY(-50%);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
  }

  .breakout-drag-thumb {
    position: absolute;
    top: 50%;
    width: 72px;
    height: 28px;
    transform: translate(-50%, -50%);
    border-radius: 10px;
    background: linear-gradient(180deg, #f5f5f5 0%, #cfd8dc 100%);
    border: 2px solid #90caf9;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
    pointer-events: none;
  }

  .breakout-drag-hint {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.45);
    pointer-events: none;
  }
</style>

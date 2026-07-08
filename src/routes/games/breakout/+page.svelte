<script lang="ts">
  import { resolve } from '$app/paths';
  import { onMount, tick } from 'svelte';
  import { ko } from 'date-fns/locale';
  import { formatRelativeTime } from '$lib/util/formatRelativeTime.js';
  import type { PageData } from './$types';
  import {
    BALL_RADIUS,
    CANVAS_HEIGHT,
    CANVAS_WIDTH,
    createBall,
    createBricks,
    createPaddle,
    getStageConfig,
    handleBrickCollision,
    handlePaddleCollision,
    handleWallCollision,
    INITIAL_LIVES,
    isBallLost,
    isGameComplete,
    isStageClear,
    moveBall,
    movePaddle,
    normalizeBallSpeed,
    PADDLE_SPEED,
    STAGES,
    type Ball,
    type Brick,
    type Paddle
  } from './gameUtils.js';

  interface BreakoutPageProps {
    data: PageData;
  }

  let { data }: BreakoutPageProps = $props();

  type Screen = 'menu' | 'playing' | 'paused' | 'stageClear' | 'gameOver' | 'gameWin' | 'ready';

  let screen = $state<Screen>('menu');
  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let ctx: CanvasRenderingContext2D | null = null;
  let paddle = $state<Paddle>(createPaddle());
  let ball = $state<Ball | null>(null);
  let bricks = $state<Brick[]>([]);
  let stage = $state(1);
  let score = $state(0);
  let lives = $state(INITIAL_LIVES);
  let ballLaunched = $state(false);
  let frameId = 0;
  let stageClearTimeout: ReturnType<typeof setTimeout> | null = null;
  let keys = $state({ left: false, right: false });
  let pointerX = $state<number | null>(null);

  let rankList = $state<
    Array<{ nickname: string; score: number; stage?: number; createdAt?: string; _id?: string }>
  >([]);
  let myBestScore = $state<number | null>(null);
  let myBestStage = $state<number | null>(null);
  let myBestCreatedAt = $state<string | null>(null);
  let todayStats = $state<{ games: number; users: number }>({ games: 0, users: 0 });
  let rankLoading = $state(false);

  const isLoggedIn = $derived(!!data.session?.user?.email);
  const stageConfig = $derived(getStageConfig(stage));

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

  async function startGame() {
    if (stageClearTimeout) clearTimeout(stageClearTimeout);
    stage = 1;
    score = 0;
    lives = INITIAL_LIVES;
    paddle = createPaddle();
    bricks = createBricks(stage);
    ball = createBall(paddle, stageConfig.ballSpeed);
    ballLaunched = false;
    screen = 'ready';
    await tick();
    initCanvasContext();
    startLoop();
    if (isLoggedIn) void logGameStart();
  }

  function startStage(stageNum: number) {
    stage = stageNum;
    paddle = createPaddle();
    bricks = createBricks(stage);
    const config = getStageConfig(stage);
    ball = createBall(paddle, config.ballSpeed);
    ballLaunched = false;
    screen = 'ready';
  }

  function launchBall() {
    if (!ball || ballLaunched) return;
    ballLaunched = true;
    screen = 'playing';
  }

  function loseLife() {
    lives -= 1;
    if (lives <= 0) {
      endGameOver();
      return;
    }
    paddle = createPaddle();
    const config = getStageConfig(stage);
    ball = createBall(paddle, config.ballSpeed);
    ballLaunched = false;
    screen = 'ready';
  }

  function endGameOver() {
    stopLoop();
    screen = 'gameOver';
    if (isLoggedIn) void submitGameScore(score, stage);
  }

  function advanceStage() {
    const nextStage = stage + 1;
    if (isGameComplete(nextStage)) {
      stopLoop();
      screen = 'gameWin';
      if (isLoggedIn) void submitGameScore(score, STAGES.length);
      return;
    }
    startStage(nextStage);
  }

  function scheduleStageClear() {
    screen = 'stageClear';
    if (stageClearTimeout) clearTimeout(stageClearTimeout);
    stageClearTimeout = setTimeout(() => {
      advanceStage();
    }, 1500);
  }

  function updateGame() {
    if (screen !== 'playing' && screen !== 'ready') return;

    if (keys.left) paddle = movePaddle(paddle, -PADDLE_SPEED);
    if (keys.right) paddle = movePaddle(paddle, PADDLE_SPEED);

    if (pointerX !== null && screen === 'playing') {
      const targetX = pointerX - paddle.width / 2;
      const clamped = Math.max(0, Math.min(CANVAS_WIDTH - paddle.width, targetX));
      paddle = { ...paddle, x: clamped };
    }

    if (!ball) return;

    if (!ballLaunched) {
      ball = { ...ball, x: paddle.x + paddle.width / 2, y: paddle.y - BALL_RADIUS - 2 };
      return;
    }

    const config = getStageConfig(stage);
    let nextBall = moveBall(ball);
    nextBall = handleWallCollision(nextBall);

    const paddleHit = handlePaddleCollision(nextBall, paddle);
    nextBall = paddleHit.ball;

    const brickHit = handleBrickCollision(nextBall, bricks, stage);
    nextBall = brickHit.ball;
    if (brickHit.hit) {
      bricks = brickHit.bricks;
      score += brickHit.scoreGained;
    }

    nextBall = normalizeBallSpeed(nextBall, config.ballSpeed);
    ball = nextBall;

    if (isBallLost(ball)) {
      loseLife();
      return;
    }

    if (isStageClear(bricks)) {
      scheduleStageClear();
    }
  }

  function drawGame() {
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(1, '#16213e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

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
    }

    ctx.fillStyle = '#e0e0e0';
    drawRoundRect(ctx, paddle.x, paddle.y, paddle.width, paddle.height, 6);
    ctx.fill();
    ctx.strokeStyle = '#90caf9';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (ball) {
      const ballGrad = ctx.createRadialGradient(
        ball.x - 2,
        ball.y - 2,
        1,
        ball.x,
        ball.y,
        ball.radius
      );
      ballGrad.addColorStop(0, '#ffffff');
      ballGrad.addColorStop(1, '#64b5f6');
      ctx.fillStyle = ballGrad;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`점수 ${score}`, 12, 24);
    ctx.fillText(`스테이지 ${stage}`, 12, 44);
    ctx.textAlign = 'right';
    ctx.fillText(`❤️ ${lives}`, CANVAS_WIDTH - 12, 24);
    ctx.textAlign = 'center';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(stageConfig.label, CANVAS_WIDTH / 2, 44);

    if (screen === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillText('클릭 또는 스페이스로 발사', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    }

    if (screen === 'paused') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.fillText('일시정지', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    }

    if (screen === 'stageClear') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = '#ffd54f';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillText(`스테이지 ${stage} 클리어!`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    }
  }

  function gameLoop() {
    updateGame();
    drawGame();
    frameId = requestAnimationFrame(gameLoop);
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
      if (screen === 'ready') launchBall();
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

  function handleCanvasClick() {
    if (screen === 'ready') launchBall();
    else if (screen === 'paused') resumeGame();
  }

  function handlePointerMove(e: PointerEvent) {
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    pointerX = (e.clientX - rect.left) * scaleX;
  }

  function handlePointerLeave() {
    pointerX = null;
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

  async function submitGameScore(finalScore: number, finalStage: number) {
    if (!isLoggedIn || finalScore <= 0) return;
    try {
      const res = await fetch('/games/breakout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: finalScore, stage: finalStage })
      });
      if (res.ok) await loadRank();
    } catch (err) {
      console.error('[breakout score submit failed]', err);
    }
  }

  function formatScore(n: number): string {
    return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n);
  }

  onMount(() => {
    return () => {
      stopLoop();
      if (stageClearTimeout) clearTimeout(stageClearTimeout);
    };
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
              <p class="text-muted mb-4">
                10단계 스테이지를 클리어하세요!<br />
                패들로 공을 튕겨 모든 블록을 깨뜨리세요.
              </p>
              <button type="button" class="btn btn-primary btn-lg px-5" onclick={startGame}>
                시작
              </button>
              <div class="mt-3 small text-muted">
                ← → 또는 마우스/터치로 패들 이동 · 스페이스로 발사
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
              <p class="text-muted mb-4">10단계 모두 클리어했습니다!</p>
              <button type="button" class="btn btn-primary me-2" onclick={startGame}>
                다시 하기
              </button>
              <button type="button" class="btn btn-outline-secondary" onclick={goToMenu}>
                메뉴
              </button>
            </div>
          {:else}
            <div class="breakout-canvas-wrap">
              <canvas
                bind:this={canvasEl}
                class="breakout-canvas"
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                onclick={handleCanvasClick}
                onpointermove={handlePointerMove}
                onpointerleave={handlePointerLeave}
                aria-label="블록깨기 게임"
              ></canvas>
            </div>
            <div class="d-flex justify-content-center gap-2 mt-3 flex-wrap">
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary"
                onclick={togglePause}
              >
                {screen === 'paused' ? '재개' : '일시정지'}
              </button>
              <button type="button" class="btn btn-sm btn-outline-secondary" onclick={goToMenu}>
                메뉴
              </button>
            </div>
            <div class="d-flex d-md-none justify-content-center gap-2 mt-2">
              <button
                type="button"
                class="btn btn-outline-primary breakout-touch-btn"
                aria-label="왼쪽"
                onpointerdown={() => (keys = { ...keys, left: true })}
                onpointerup={() => (keys = { ...keys, left: false })}
                onpointerleave={() => (keys = { ...keys, left: false })}
              >
                ◀
              </button>
              <button
                type="button"
                class="btn btn-primary breakout-touch-btn"
                aria-label="발사"
                onclick={() => {
                  if (screen === 'ready') launchBall();
                }}
              >
                ●
              </button>
              <button
                type="button"
                class="btn btn-outline-primary breakout-touch-btn"
                aria-label="오른쪽"
                onpointerdown={() => (keys = { ...keys, right: true })}
                onpointerup={() => (keys = { ...keys, right: false })}
                onpointerleave={() => (keys = { ...keys, right: false })}
              >
                ▶
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
                {#each rankList as r, i}
                  <li class="list-group-item d-flex justify-content-between align-items-center px-0">
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
    cursor: crosshair;
  }

  .breakout-touch-btn {
    width: 64px;
    height: 48px;
    font-size: 1.25rem;
    touch-action: manipulation;
    user-select: none;
  }
</style>

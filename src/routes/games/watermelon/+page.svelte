<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Matter from 'matter-js';
  import { FRUITS, GAME_WIDTH, GAME_HEIGHT, WALL_THICKNESS, type FruitType } from './gameUtils';

  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  // --- State ---
  let score = $state(0);
  let gameOver = $state(false);
  let gameStarted = $state(false);
  let hasReached2048 = $state(false);
  let currentFruitIndex = $state(0);
  let nextFruitIndex = $state(0);
  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let rankList = $state<Array<{ nickname: string; score: number; _id?: string }>>([]);
  let myBestScore = $state<number | null>(null);
  let loading = $state(false);

  const isLoggedIn = $derived(!!data.session?.user?.email);

  // --- Physics Vars ---
  // We'll keep these in a closure or module scope effectively since this component is a singleton page usually.
  let engine: Matter.Engine;
  let render: Matter.Render;
  let runner: Matter.Runner;
  let dropLineX = $state(GAME_WIDTH / 2);
  let currFruitBody: Matter.Body | null = null;
  let isDropping = $state(false); // Prevent spamming drops
  let isClearing = $state(false); // Prevent interactions and game over while clearing

  const Engine = Matter.Engine,
    Render = Matter.Render,
    Runner = Matter.Runner,
    Bodies = Matter.Bodies,
    Composite = Matter.Composite,
    Events = Matter.Events,
    Body = Matter.Body;

  function getRandomFruitIndex() {
    // Usually only small fruits drop (0 to 3: 2, 4, 8, 16)
    return Math.floor(Math.random() * 4);
  }

  function createFruit(x: number, y: number, index: number, isStatic = false): Matter.Body {
    const fruit = FRUITS[index];
    const body = Bodies.circle(x, y, fruit.radius, {
      label: `fruit_${index}`,
      isStatic: isStatic,
      restitution: 0.2, // Bouncy
      render: {
        fillStyle: fruit.color
      }
    });
    // Add custom property for easy access to level
    (body as any).gameLevel = index;
    return body;
  }

  // Initial next fruit
  currentFruitIndex = getRandomFruitIndex();
  nextFruitIndex = getRandomFruitIndex();

  onMount(() => {
    if (!canvasEl) return;

    // 1. Setup Matter JS
    engine = Engine.create();
    const world = engine.world;

    render = Render.create({
      canvas: canvasEl,
      engine: engine,
      options: {
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        wireframes: false,
        background: '#faf8ef' // 2048 bg color
      }
    });

    // Resize handling (basic)
    // We stick to fixed internal resolution for physics consistency, scale via CSS if needed.

    // 2. Add Walls
    const ground = Bodies.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT + WALL_THICKNESS / 2,
      GAME_WIDTH,
      WALL_THICKNESS,
      { isStatic: true, render: { fillStyle: '#bbada0' } }
    );
    const leftWall = Bodies.rectangle(
      0 - WALL_THICKNESS / 2,
      GAME_HEIGHT / 2,
      WALL_THICKNESS,
      GAME_HEIGHT * 2,
      { isStatic: true, render: { fillStyle: '#bbada0' } }
    );
    const rightWall = Bodies.rectangle(
      GAME_WIDTH + WALL_THICKNESS / 2,
      GAME_HEIGHT / 2,
      WALL_THICKNESS,
      GAME_HEIGHT * 2,
      { isStatic: true, render: { fillStyle: '#bbada0' } }
    );
    // Top "Game Over" Line Sensor (optional, or check y position in loop)

    Composite.add(world, [ground, leftWall, rightWall]);

    // 3. Collision Logic (Merge)
    Events.on(engine, 'collisionStart', (event) => {
      const pairs = event.pairs;
      for (const pair of pairs) {
        const bodyA = pair.bodyA as any;
        const bodyB = pair.bodyB as any;

        // Check if both are fruits and same level
        if (bodyA.gameLevel !== undefined && bodyB.gameLevel !== undefined) {
          if (bodyA.gameLevel === bodyB.gameLevel) {
            // Merge!
            const level = bodyA.gameLevel;
            // If max level, maybe disappear or stay? usually just keep going or max out.
            // 2048 goes up to ... 2048. If we hit max index, we can stop merging or loop?
            // Let's stop merging at max index for now or create a SUPER fruit.
            if (level < FRUITS.length - 1) {
              // Calculate spawn position (midpoint)
              const midX = (bodyA.position.x + bodyB.position.x) / 2;
              const midY = (bodyA.position.y + bodyB.position.y) / 2;

              // Remove old bodies
              Composite.remove(world, [bodyA, bodyB]);

              // Create new larger fruit
              const newFruit = createFruit(midX, midY, level + 1);
              Composite.add(world, newFruit);

              // Add Score
              const points = FRUITS[level + 1].value;
              score += points;

              // Check for 2048 Clear
              if (level + 1 >= 10) {
                hasReached2048 = true;
                if (!isClearing) {
                  isClearing = true;

                  // Clear board after 1.5 seconds so user sees the 2048 fruit
                  setTimeout(() => {
                    if (engine && engine.world) {
                      const allFruits = Composite.allBodies(engine.world).filter(
                        (b) => (b as any).gameLevel !== undefined
                      );
                      Composite.remove(engine.world, allFruits);
                    }
                    isClearing = false;
                    currentFruitIndex = getRandomFruitIndex();
                    nextFruitIndex = getRandomFruitIndex();
                    resetIdleTimer();
                  }, 1500);
                }
              }

              // Trigger Effect
              effects.push({
                x: midX,
                y: midY,
                text: `+${points}`,
                age: 0,
                maxAge: 30, // 0.5s roughly
                color: FRUITS[level + 1].color // Color of the new fruit
              });
            }
          }
        }
      }
    });

    // 4. Custom Render Loop to draw text on circles
    // Matter.Render doesn't support text on bodies natively easily.
    // We can hook into 'afterRender' event of the built-in renderer
    Events.on(render, 'afterRender', () => {
      const ctx = render.context;
      const bodies = Composite.allBodies(engine.world);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      bodies.forEach((body) => {
        if ((body as any).gameLevel !== undefined) {
          const fruit = FRUITS[(body as any).gameLevel];
          const fontSize = fruit.level > 6 ? fruit.radius * 0.5 : fruit.radius * 0.8;
          ctx.font = `bold ${fontSize}px Arial`;
          ctx.fillStyle = fruit.level > 2 ? '#f9f6f2' : '#776e65'; // White text for darker tiles

          ctx.save();
          ctx.translate(body.position.x, body.position.y);
          ctx.rotate(body.angle);
          ctx.fillText(fruit.label, 0, 0);
          ctx.restore();
        }
      });

      // Draw Merge Effects
      for (let i = effects.length - 1; i >= 0; i--) {
        const effect = effects[i];
        effect.age++;
        if (effect.age > effect.maxAge) {
          effects.splice(i, 1);
          continue;
        }

        const alpha = 1 - effect.age / effect.maxAge;
        const yOffset = effect.age * 1; // Float up

        ctx.globalAlpha = alpha;
        ctx.font = 'bold 24px Arial';
        ctx.fillStyle = effect.color;
        ctx.fillText(effect.text, effect.x, effect.y - yOffset);
        ctx.globalAlpha = 1;
      }

      // Draw "Game Over" Line
      ctx.beginPath();
      ctx.moveTo(0, 100); // Top dead zone
      ctx.lineTo(GAME_WIDTH, 100);
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // 5. Game Over Check (afterUpdate)
    Events.on(engine, 'afterUpdate', () => {
      if (gameOver || isClearing) return;

      // Check if any fruit is stationary above the line
      // Simple check: if a fruit's y < 100 and it's NOT the current lingering/dropping fruit
      // We need to be careful not to trigger it immediately when spawning.
      // Usually there's a timer. If it stays above line for X seconds.
      // For simplicity: if velocity is low and y < 100

      const bodies = Composite.allBodies(world);
      for (const body of bodies) {
        if ((body as any).gameLevel !== undefined && !body.isStatic) {
          if (
            body.position.y < 80 &&
            Math.abs(body.velocity.y) < 0.2 &&
            Math.abs(body.velocity.x) < 0.2
          ) {
            gameOver = true;
            if (idleSaveTimer) clearTimeout(idleSaveTimer);
            clearGameState();
            submitGameOverScore(score);
          }
        }
      }
    });

    Render.run(render);
    // runner is created and started in startGame()

    // 6. Event listeners
    window.addEventListener('keydown', handleKeydown);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial load
    loadGameState();

    return () => {
      if (idleSaveTimer) clearTimeout(idleSaveTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('keydown', handleKeydown);
      if (render) {
        Render.stop(render);
        if (render.canvas) render.canvas.remove();
      }
      if (runner) Runner.stop(runner);
      if (engine) Engine.clear(engine);
    };
  });

  function startGame() {
    if (!engine || gameStarted) return;
    gameStarted = true;
    runner = Runner.create();
    Runner.run(runner, engine);
    resetIdleTimer();
  }

  $effect(() => {
    // Re-clamp position when next fruit changes (radii vary)
    dropLineX = getConstrainedX(dropLineX);
  });

  $effect(() => {
    if (isLoggedIn) loadRank();
  });

  async function loadRank() {
    loading = true;
    try {
      const res = await fetch(`/games/watermelon?rank=1&_=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const j = await res.json();
        rankList = j.rank ?? [];
        myBestScore = j.myBest != null ? Number(j.myBest) : null;
      }
    } catch (e) {
      console.error('Failed to load rank', e);
    } finally {
      loading = false;
    }
  }

  async function submitGameOverScore(finalScore: number) {
    if (!isLoggedIn || finalScore <= 0) return;
    try {
      const res = await fetch('/games/watermelon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: finalScore })
      });
      if (res.ok) await loadRank();
    } catch (e) {
      console.error('Failed to submit score', e);
    }
  }

  // --- Visual Effects ---
  let effects: {
    x: number;
    y: number;
    text: string;
    age: number;
    maxAge: number;
    color: string;
  }[] = [];

  // --- Auto Save Logic ---
  let idleSaveTimer: ReturnType<typeof setTimeout> | null = null;
  const IDLE_SAVE_MS = 10000;

  function resetIdleTimer() {
    if (idleSaveTimer) clearTimeout(idleSaveTimer);
    if (!gameStarted || gameOver) return;

    idleSaveTimer = setTimeout(() => {
      saveGameState();
    }, IDLE_SAVE_MS);
  }

  function saveGameState() {
    if (!gameStarted || gameOver || !engine) return;
    try {
      const bodies = Composite.allBodies(engine.world).filter(
        (b) => (b as any).gameLevel !== undefined && !b.isStatic
      );
      const fruitsData = bodies.map((b) => ({
        x: b.position.x,
        y: b.position.y,
        vx: b.velocity.x,
        vy: b.velocity.y,
        angle: b.angle,
        angularVelocity: b.angularVelocity,
        gameLevel: (b as any).gameLevel
      }));

      const state = {
        score,
        currentFruitIndex,
        nextFruitIndex,
        fruits: fruitsData
      };

      localStorage.setItem('watermelonGameState', JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save game state', e);
    }
  }

  function loadGameState() {
    const saved = localStorage.getItem('watermelonGameState');
    if (!saved) return false;

    try {
      const state = JSON.parse(saved);
      score = state.score || 0;
      if (state.currentFruitIndex !== undefined) {
        currentFruitIndex = state.currentFruitIndex;
      }
      if (state.nextFruitIndex !== undefined) {
        nextFruitIndex = state.nextFruitIndex;
      }

      const existingFruits = Composite.allBodies(engine.world).filter(
        (b) => (b as any).gameLevel !== undefined && !b.isStatic
      );
      Composite.remove(engine.world, existingFruits);

      if (state.fruits && Array.isArray(state.fruits)) {
        state.fruits.forEach((f: any) => {
          const newFruit = createFruit(f.x, f.y, f.gameLevel);
          Body.setAngle(newFruit, f.angle || 0);
          Body.setVelocity(newFruit, { x: f.vx || 0, y: f.vy || 0 });
          Body.setAngularVelocity(newFruit, f.angularVelocity || 0);
          Composite.add(engine.world, newFruit);
        });
      }
      return true;
    } catch (e) {
      console.error('Failed to load game state', e);
      return false;
    }
  }

  function clearGameState() {
    localStorage.removeItem('watermelonGameState');
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      saveGameState();
    }
  }

  function dropFruit() {
    if (gameOver || isDropping || isClearing) return;

    isDropping = true;
    const spawnX = dropLineX;
    const spawnY = 50; // Above the danger line

    const newFruit = createFruit(spawnX, spawnY, currentFruitIndex);
    Composite.add(engine.world, newFruit);

    // Cooldown & Next Fruit: wait longer (1s) to let current fruit fall
    setTimeout(() => {
      isDropping = false;
      currentFruitIndex = nextFruitIndex;
      nextFruitIndex = getRandomFruitIndex();
      resetIdleTimer(); // Reset timer for save
    }, 1000); // 1.0s delay between drops
  }

  function getConstrainedX(rawX: number) {
    const radius = FRUITS[currentFruitIndex].radius;
    return Math.max(radius, Math.min(GAME_WIDTH - radius, rawX));
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isLoggedIn || !gameStarted || gameOver || isDropping || isClearing) return;
    const rect = canvasEl?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    dropLineX = getConstrainedX(x);
    resetIdleTimer();
  }

  function handlePointerUp(e: PointerEvent) {
    if (!isLoggedIn || !gameStarted || gameOver || isDropping || isClearing) return;
    dropFruit();
    resetIdleTimer();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!isLoggedIn || !gameStarted || gameOver || isDropping || isClearing) return;

    if (e.key === 'ArrowLeft') {
      dropLineX = getConstrainedX(dropLineX - 25);
      resetIdleTimer();
    } else if (e.key === 'ArrowRight') {
      dropLineX = getConstrainedX(dropLineX + 25);
      resetIdleTimer();
    } else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      dropFruit();
      resetIdleTimer();
    }
  }

  function resetGame() {
    if (!engine) return;
    Composite.clear(engine.world, false); // clear all bodies
    // Re-add walls
    const ground = Bodies.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT + WALL_THICKNESS / 2,
      GAME_WIDTH,
      WALL_THICKNESS,
      { isStatic: true, render: { fillStyle: '#bbada0' } }
    );
    const leftWall = Bodies.rectangle(
      0 - WALL_THICKNESS / 2,
      GAME_HEIGHT / 2,
      WALL_THICKNESS,
      GAME_HEIGHT * 2,
      { isStatic: true, render: { fillStyle: '#bbada0' } }
    );
    const rightWall = Bodies.rectangle(
      GAME_WIDTH + WALL_THICKNESS / 2,
      GAME_HEIGHT / 2,
      WALL_THICKNESS,
      GAME_HEIGHT * 2,
      { isStatic: true, render: { fillStyle: '#bbada0' } }
    );
    Composite.add(engine.world, [ground, leftWall, rightWall]);

    score = 0;
    gameOver = false;
    hasReached2048 = false;
    isClearing = false;
    currentFruitIndex = getRandomFruitIndex();
    nextFruitIndex = getRandomFruitIndex();

    clearGameState();
    resetIdleTimer();
  }
</script>

<svelte:head>
  <title>2048 드롭 | 데게실버타운</title>
</svelte:head>

<div class="container py-4 watermelon-page">
  <div class="row justify-content-center">
    <!-- Game Column -->
    <div class="col-12 col-lg-8 d-flex flex-column align-items-center">
      <div
        class="header d-flex justify-content-between w-100 align-items-center"
        style="max-width: {GAME_WIDTH}px;"
      >
        <div>
          <h1 class="fw-bold mb-0" style="font-size: 3rem;">2048 드롭</h1>
          <p class="text-body-secondary mb-0">과일을 합쳐 2048을 만드세요!</p>
        </div>
        <div class="score-container">
          <div class="score-label">점수</div>
          <div class="score-value">{score}</div>
        </div>
      </div>

      <div
        class="game-container mt-3 position-relative"
        style="width: {GAME_WIDTH}px; height: {GAME_HEIGHT}px;"
      >
        <!-- Next Fruit Preview -->
        <div class="next-fruit-indicator text-center mb-2">
          <span class="badge bg-light text-dark border">다음: {FRUITS[nextFruitIndex].label}</span>
        </div>

        <canvas
          bind:this={canvasEl}
          width={GAME_WIDTH}
          height={GAME_HEIGHT}
          class="rounded shadow-sm border bg-white"
          onpointermove={isLoggedIn ? handlePointerMove : null}
          onpointerup={isLoggedIn ? handlePointerUp : null}
          style="touch-action: none; cursor: {isLoggedIn ? 'crosshair' : 'default'};"
        ></canvas>

        <!-- Dropper Line/Ghost -->
        {#if isLoggedIn && gameStarted && !gameOver && !isDropping}
          <div
            class="dropper-guide"
            style="
                    left: {dropLineX}px; 
                    top: 50px; 
                    width: 2px; 
                    height: 300px;
                    background: rgba(0,0,0,0.1);
                "
          ></div>
          <div
            class="dropper-preview"
            style="
                    left: {dropLineX}px;
                    top: 50px;
                    width: {FRUITS[currentFruitIndex].radius * 2}px;
                    height: {FRUITS[currentFruitIndex].radius * 2}px;
                    margin-left: -{FRUITS[currentFruitIndex].radius}px;
                    margin-top: -{FRUITS[currentFruitIndex].radius}px;
                    background-color: {FRUITS[currentFruitIndex].color};
                    border: 2px solid rgba(0,0,0,0.2);
                    border-radius: 50%;
                "
          >
            <span style="line-height: {FRUITS[currentFruitIndex].radius * 2}px;"
              >{FRUITS[currentFruitIndex].label}</span
            >
          </div>
        {/if}

        {#if !isLoggedIn}
          <div
            class="login-overlay position-absolute top-0 start-0 w-100 h-100 d-flex flex-column align-items-center justify-content-center bg-body bg-opacity-95 rounded"
            style="z-index: 100;"
          >
            <h3 class="fw-bold mb-3">로그인 후 이용 가능합니다</h3>
            <p class="mb-4">점수를 기록하고 랭킹에 도전해보세요!</p>
            <a href="/auth/signin" class="btn btn-primary btn-lg px-5 shadow-sm">로그인하기</a>
          </div>
        {:else if !gameStarted}
          <div
            class="start-overlay position-absolute top-0 start-0 w-100 h-100 d-flex flex-column align-items-center justify-content-center bg-body bg-opacity-95 rounded"
            style="z-index: 100;"
          >
            <h3 class="fw-bold mb-4">게임 안내</h3>
            <div class="text-start mb-4 px-4">
              <p class="mb-2">🎯 <strong>목표</strong>: 과일을 합쳐 2048을 만드세요!</p>
              <p class="mb-2">
                🖱️ <strong>조작</strong>: 마우스 이동/클릭 또는 방향키를 사용하세요.
              </p>
              <p class="mb-2">
                💾 <strong>저장</strong>: 10초간 조작이 없거나 창을 닫으면 자동 저장됩니다.
              </p>
              <p class="mb-0">
                🚫 <strong>종료</strong>: 과일이 빨간 점선 위로 쌓이면 게임 오버!
              </p>
            </div>
            <button class="btn btn-success btn-lg px-5 shadow-sm fw-bold" onclick={startGame}>
              게임 시작!
            </button>
          </div>
        {:else if gameOver}
          <div
            class="game-over-overlay position-absolute top-0 start-0 w-100 h-100 d-flex flex-column align-items-center justify-content-center bg-body bg-opacity-95 rounded"
            style="z-index: 100;"
          >
            {#if hasReached2048}
              <h2 class="fw-bold text-success mb-3">2048 달성! 게임 오버</h2>
            {:else}
              <h2 class="fw-bold text-danger mb-3">게임 오버!</h2>
            {/if}
            <p class="fs-5">최종 점수: {score}</p>
            <p class="small fw-bold mb-3">랭킹에 점수가 등록되었습니다!</p>
            <button class="btn btn-primary btn-lg" onclick={resetGame}>다시 하기</button>
          </div>
        {/if}
      </div>

      <div class="mt-3 fw-bold small text-center" style="max-width: 400px;">
        <p class="mb-1">클릭/터치하여 과일을 떨어뜨리세요. 같은 숫자가 합쳐집니다.</p>
        <p class="mb-0 text-primary">게임은 자동으로 저장됩니다.</p>
      </div>
    </div>

    <!-- Ranking Column -->
    <div class="col-12 col-lg-4 mt-4 mt-lg-0">
      <div class="card shadow rounded-4">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="mb-0">랭킹 Top 10</h5>
            {#if isLoggedIn}
              <button
                class="btn btn-sm btn-outline-secondary"
                onclick={loadRank}
                disabled={loading}
              >
                🔄
              </button>
            {:else}
              <a href="/auth/signin" class="btn btn-sm btn-outline-primary">로그인</a>
            {/if}
          </div>
          <p class="small text-muted mb-3">최근 3일 내 최고 점수 (유저별)</p>

          {#if isLoggedIn}
            {#if myBestScore !== null}
              <div
                class="alert alert-info py-2 px-3 mb-3 d-flex justify-content-between align-items-center"
              >
                <span class="small fw-bold">내 최고 (3일)</span>
                <span class="fw-bold">{myBestScore}</span>
              </div>
            {/if}

            <ol class="list-group list-group-numbered">
              {#each rankList as r}
                <li class="list-group-item d-flex justify-content-between align-items-center">
                  <span class="text-truncate" style="max-width: 120px;">{r.nickname}</span>
                  <span class="fw-bold font-monospace">{r.score}</span>
                </li>
              {/each}
              {#if rankList.length === 0}
                <li class="list-group-item text-center text-muted small">기록이 없습니다.</li>
              {/if}
            </ol>
          {:else}
            <p class="small text-muted text-center py-4">로그인하면 랭킹을 볼 수 있습니다.</p>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .watermelon-page {
    font-family: 'Clear Sans', 'Helvetica Neue', Arial, sans-serif;
  }
  .game-container {
    user-select: none;
    background: #bbada0;
    padding: 10px;
    border-radius: 6px;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
  }
  canvas {
    border-radius: 4px;
    box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.1);
  }
  .dropper-guide {
    position: absolute;
    pointer-events: none;
    z-index: 10;
    border-left: 2px dashed rgba(255, 255, 255, 0.5);
  }
  .dropper-preview {
    position: absolute;
    pointer-events: none;
    z-index: 10;
    display: flex;
    justify-content: center;
    align-items: center;
    font-weight: bold;
    color: #776e65;
    font-size: 1.2rem;
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.2);
    transition: left 0.1s ease-out;
  }
  .header {
    margin-bottom: 20px;
  }
  .score-container {
    background: #bbada0;
    padding: 5px 10px;
    border-radius: 3px;
    color: white;
    text-align: center;
    min-width: 60px;
  }
  .score-label {
    font-size: 12px;
    text-transform: uppercase;
    opacity: 0.7;
  }
  .score-value {
    font-size: 24px;
    font-weight: bold;
  }
</style>

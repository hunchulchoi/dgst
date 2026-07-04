<script lang="ts">
  import { onMount } from 'svelte';
  import Matter from 'matter-js';
  import {
    BALL_RADIUS,
    BALL_FRICTION_AIR,
    BALL_RESTITUTION,
    BILLIARDS_MODES,
    FOUR_BALL_CHANCES,
    RAIL_RESTITUTION,
    RAIL_THICKNESS,
    STOP_SPEED,
    TABLE_HEIGHT,
    TABLE_WIDTH,
    containBallInTable,
    computeBreathingAimAngle,
    computeShotVelocity,
    computeSpinFromTrack,
    computeSweepingPower,
    evaluateFourBallShot,
    stopped,
    type ShotContact
  } from './gameUtils';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  type Status = 'aiming' | 'charging' | 'rolling' | 'scored' | 'miss' | 'game-over';
  type RankEntry = {
    nickname: string;
    mode: string;
    score: number;
    createdAt?: string;
    _id?: string;
  };
  type BallBody = Matter.Body & { billiardsRole?: 'cue' | 'red'; billiardsId?: string };

  let { data }: Props = $props();

  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let score = $state(0);
  let chances = $state(FOUR_BALL_CHANCES);
  let status = $state<Status>('aiming');
  let aimAngle = $state(-Math.PI / 2);
  let displayAimAngle = $state(-Math.PI / 2);
  let aimPoint = $state<{ x: number; y: number } | null>(null);
  let aimingStartedAt = 0;
  let isHoldingAim = false;
  let spin = $state(0);
  let activeSpin = 0;
  let power = $state(55);
  let chargeStartedAt = 0;
  let chargeTimeout: ReturnType<typeof setTimeout> | null = null;
  let rankList = $state<RankEntry[]>([]);
  let myBestScore = $state<number | null>(null);
  let rankLoading = $state(false);
  let submittedGameOver = false;
  let contacts: ShotContact[] = [];

  const isLoggedIn = $derived(!!data.session?.user?.email);
  const statusText = $derived(
    status === 'aiming'
      ? '방향을 고르고 힘 재기를 누르세요'
      : status === 'charging'
        ? '원하는 힘에서 선택하세요'
        : status === 'rolling'
          ? '공이 멈출 때까지 기다리세요'
          : status === 'scored'
            ? '득점! 한 번 더'
            : status === 'miss'
              ? '아쉽습니다. 다시 조준하세요'
              : '게임 종료'
  );

  const Engine = Matter.Engine;
  const Bodies = Matter.Bodies;
  const Body = Matter.Body;
  const Composite = Matter.Composite;
  const Events = Matter.Events;

  let engine: Matter.Engine | null = null;
  let cueBall: BallBody | null = null;
  let redBalls: BallBody[] = [];
  let frameId = 0;
  let lastFrame = 0;

  function makeBall(
    x: number,
    y: number,
    role: 'cue' | 'red',
    id: string,
    color: string
  ): BallBody {
    const ball = Bodies.circle(x, y, BALL_RADIUS, {
      label: id,
      restitution: BALL_RESTITUTION,
      friction: 0,
      frictionStatic: 0,
      frictionAir: BALL_FRICTION_AIR,
      render: { fillStyle: color }
    }) as BallBody;
    ball.billiardsRole = role;
    ball.billiardsId = id;
    return ball;
  }

  function makeRail(x: number, y: number, width: number, height: number) {
    return Bodies.rectangle(x, y, width, height, {
      isStatic: true,
      restitution: RAIL_RESTITUTION,
      friction: 0,
      render: { fillStyle: '#31533b' }
    });
  }

  function resetBodies() {
    if (!engine) return;
    Composite.clear(engine.world, false);

    const rail = RAIL_THICKNESS;
    const walls = [
      makeRail(TABLE_WIDTH / 2, rail / 2, TABLE_WIDTH, rail),
      makeRail(TABLE_WIDTH / 2, TABLE_HEIGHT - rail / 2, TABLE_WIDTH, rail),
      makeRail(rail / 2, TABLE_HEIGHT / 2, rail, TABLE_HEIGHT),
      makeRail(TABLE_WIDTH - rail / 2, TABLE_HEIGHT / 2, rail, TABLE_HEIGHT)
    ];

    cueBall = makeBall(TABLE_WIDTH * 0.5, TABLE_HEIGHT * 0.72, 'cue', 'cue', '#f8f7ef');
    redBalls = [
      makeBall(TABLE_WIDTH * 0.42, TABLE_HEIGHT * 0.28, 'red', 'red-1', '#d7352a'),
      makeBall(TABLE_WIDTH * 0.58, TABLE_HEIGHT * 0.28, 'red', 'red-2', '#c71920')
    ];

    Composite.add(engine.world, [...walls, cueBall, ...redBalls]);
  }

  function newGame() {
    score = 0;
    chances = FOUR_BALL_CHANCES;
    status = 'aiming';
    contacts = [];
    aimAngle = -Math.PI / 2;
    displayAimAngle = -Math.PI / 2;
    aimPoint = null;
    aimingStartedAt = 0;
    isHoldingAim = false;
    spin = 0;
    activeSpin = 0;
    power = 55;
    stopCharging();
    submittedGameOver = false;
    resetBodies();
  }

  function getTrackedBalls(): BallBody[] {
    return cueBall ? [cueBall, ...redBalls] : [];
  }

  function settleShot() {
    const balls = getTrackedBalls();
    for (const ball of balls) {
      Body.setVelocity(ball, { x: 0, y: 0 });
      Body.setAngularVelocity(ball, 0);
    }

    const result = evaluateFourBallShot(contacts);
    contacts = [];

    if (result.scored) {
      score += 1;
      status = 'scored';
      return;
    }

    chances = Math.max(0, chances - 1);
    if (chances === 0) {
      status = 'game-over';
      void submitScore();
      return;
    }

    status = 'miss';
  }

  function recordCueContact(bodyA: BallBody, bodyB: BallBody) {
    const cue =
      bodyA.billiardsRole === 'cue' ? bodyA : bodyB.billiardsRole === 'cue' ? bodyB : null;
    const target = cue === bodyA ? bodyB : bodyA;
    if (!cue || target.billiardsRole !== 'red' || !target.billiardsId) return;
    contacts = [...contacts, { cueRole: 'red', targetId: target.billiardsId }];
  }

  function getCanvasPoint(event: PointerEvent) {
    if (!canvasEl) return null;
    const rect = canvasEl.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * TABLE_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * TABLE_HEIGHT
    };
  }

  function canAim() {
    return status === 'aiming' || status === 'scored' || status === 'miss';
  }

  function canCharge() {
    return canAim() || status === 'charging';
  }

  function stopCharging() {
    if (chargeTimeout) clearTimeout(chargeTimeout);
    chargeTimeout = null;
    chargeStartedAt = 0;
  }

  function updateAimFromPointer(event: PointerEvent) {
    if (!cueBall || !canAim()) return;
    const point = getCanvasPoint(event);
    if (!point) return;
    const dx = point.x - cueBall.position.x;
    const dy = point.y - cueBall.position.y;
    if (Math.hypot(dx, dy) < BALL_RADIUS * 1.4) return;
    event.preventDefault();
    aimAngle = Math.atan2(dy, dx);
    displayAimAngle = aimAngle;
    aimPoint = point;
  }

  function updateSpinFromPointer(event: PointerEvent) {
    if (!canAim()) return;
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    spin = computeSpinFromTrack(event.clientX - rect.left, rect.width);
    event.preventDefault();
  }

  function handleSpinPointerDown(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    updateSpinFromPointer(event);
  }

  function handlePointerDown(event: PointerEvent) {
    if (canAim()) {
      aimingStartedAt = performance.now();
      isHoldingAim = true;
    }
    updateAimFromPointer(event);
  }

  function handlePointerMove(event: PointerEvent) {
    if (event.buttons !== 1 && event.pointerType === 'mouse') return;
    updateAimFromPointer(event);
  }

  function handlePointerUp() {
    if (!canAim()) return;
    aimAngle = displayAimAngle;
    isHoldingAim = false;
  }

  function shoot(selectedPower = power) {
    if (!cueBall || !canCharge()) return;
    stopCharging();
    isHoldingAim = false;
    power = selectedPower;
    const velocity = computeShotVelocity(aimAngle, selectedPower);
    if (Math.hypot(velocity.x, velocity.y) < 0.1) return;
    contacts = [];
    Body.setVelocity(cueBall, velocity);
    Body.setAngularVelocity(cueBall, spin / 220);
    activeSpin = spin;
    status = 'rolling';
    aimPoint = null;
  }

  function startCharging() {
    if (!canAim()) return;
    aimAngle = displayAimAngle;
    isHoldingAim = false;
    status = 'charging';
    chargeStartedAt = performance.now();
    if (chargeTimeout) clearTimeout(chargeTimeout);
    chargeTimeout = setTimeout(() => {
      if (status !== 'charging') return;
      shoot(10 + Math.floor(Math.random() * 91));
    }, 2400);
  }

  function lockPowerAndShoot() {
    if (status !== 'charging') {
      startCharging();
      return;
    }
    shoot(power);
  }

  function drawBall(ctx: CanvasRenderingContext2D, ball: BallBody) {
    const role = ball.billiardsRole;
    ctx.beginPath();
    ctx.arc(ball.position.x, ball.position.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle =
      role === 'cue' ? '#faf9f1' : ball.billiardsId === 'red-1' ? '#dc342c' : '#bd1f26';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = role === 'cue' ? '#d8d0bc' : '#8e1518';
    ctx.stroke();
    if (role === 'cue') {
      ctx.beginPath();
      ctx.arc(ball.position.x - 3, ball.position.y - 3, 2.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
      ctx.fill();
    }
  }

  function drawAim(ctx: CanvasRenderingContext2D) {
    if (!cueBall || !canCharge()) return;
    const len = 58 + power * 1.05;
    const endX = cueBall.position.x + Math.cos(displayAimAngle) * len;
    const endY = cueBall.position.y + Math.sin(displayAimAngle) * len;
    const backX = cueBall.position.x - Math.cos(displayAimAngle) * 28;
    const backY = cueBall.position.y - Math.sin(displayAimAngle) * 28;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 236, 158, 0.88)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(cueBall.position.x, cueBall.position.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(cueBall.position.x, cueBall.position.y);
    ctx.lineTo(backX, backY);
    ctx.stroke();
    if (aimPoint) {
      ctx.beginPath();
      ctx.arc(aimPoint.x, aimPoint.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.46)';
      ctx.fill();
    }
    ctx.restore();
  }

  function draw() {
    if (!canvasEl || !engine) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
    ctx.fillStyle = '#163f2b';
    ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
    ctx.fillStyle = '#267044';
    ctx.fillRect(
      RAIL_THICKNESS,
      RAIL_THICKNESS,
      TABLE_WIDTH - RAIL_THICKNESS * 2,
      TABLE_HEIGHT - RAIL_THICKNESS * 2
    );
    ctx.strokeStyle = '#d6b36a';
    ctx.lineWidth = 2;
    ctx.strokeRect(
      RAIL_THICKNESS + 6,
      RAIL_THICKNESS + 6,
      TABLE_WIDTH - RAIL_THICKNESS * 2 - 12,
      TABLE_HEIGHT - RAIL_THICKNESS * 2 - 12
    );

    for (const ball of getTrackedBalls()) drawBall(ctx, ball);
    drawAim(ctx);
  }

  function keepBallsInsideTable() {
    for (const ball of getTrackedBalls()) {
      const next = containBallInTable({
        position: ball.position,
        velocity: ball.velocity
      });
      if (!next.corrected) continue;
      Body.setPosition(ball, next.position);
      Body.setVelocity(ball, next.velocity);
    }
  }

  function tick(now: number) {
    if (!engine) return;
    const delta = lastFrame ? Math.min(now - lastFrame, 32) : 16.66;
    lastFrame = now;
    Engine.update(engine, delta);
    keepBallsInsideTable();

    if (isHoldingAim && canAim()) {
      displayAimAngle = computeBreathingAimAngle(
        aimAngle,
        now - aimingStartedAt,
        now - aimingStartedAt
      );
    }

    if (status === 'charging') {
      power = computeSweepingPower(now - chargeStartedAt);
    }

    if (status === 'rolling' && cueBall && activeSpin !== 0) {
      const speed = Math.hypot(cueBall.velocity.x, cueBall.velocity.y);
      if (speed > STOP_SPEED) {
        const curve = (activeSpin / 100) * 0.0018 * delta;
        const cos = Math.cos(curve);
        const sin = Math.sin(curve);
        Body.setVelocity(cueBall, {
          x: cueBall.velocity.x * cos - cueBall.velocity.y * sin,
          y: cueBall.velocity.x * sin + cueBall.velocity.y * cos
        });
        activeSpin *= 0.995;
      }
    }

    if (status === 'rolling' && stopped(getTrackedBalls(), STOP_SPEED)) {
      activeSpin = 0;
      settleShot();
    }

    draw();
    frameId = requestAnimationFrame(tick);
  }

  async function loadRank() {
    if (!isLoggedIn) return;
    rankLoading = true;
    try {
      const res = await fetch(`/games/billiards?rank=1&mode=${BILLIARDS_MODES.FOUR_BALL}`);
      if (!res.ok) return;
      const body = await res.json();
      rankList = Array.isArray(body.rank) ? body.rank : [];
      myBestScore = typeof body.myBest?.score === 'number' ? body.myBest.score : null;
    } catch (error) {
      console.error('[billiards rank load failed]', error);
    } finally {
      rankLoading = false;
    }
  }

  async function submitScore() {
    if (!isLoggedIn || submittedGameOver) return;
    submittedGameOver = true;
    try {
      const res = await fetch('/games/billiards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: BILLIARDS_MODES.FOUR_BALL, score })
      });
      if (res.ok) await loadRank();
    } catch (error) {
      console.error('[billiards score submit failed]', error);
    }
  }

  onMount(() => {
    if (!canvasEl) return;
    canvasEl.width = TABLE_WIDTH;
    canvasEl.height = TABLE_HEIGHT;
    engine = Engine.create({ gravity: { x: 0, y: 0 } });
    resetBodies();

    Events.on(engine, 'collisionStart', (event) => {
      for (const pair of event.pairs)
        recordCueContact(pair.bodyA as BallBody, pair.bodyB as BallBody);
    });

    void loadRank();
    frameId = requestAnimationFrame(tick);

    return () => {
      stopCharging();
      if (frameId) cancelAnimationFrame(frameId);
      if (engine) {
        Events.off(engine, 'collisionStart');
        Composite.clear(engine.world, false);
        Engine.clear(engine);
      }
      engine = null;
    };
  });
</script>

<svelte:head>
  <title>4구 당구 - dgst.me</title>
</svelte:head>

<div class="billiards-page">
  <section class="billiards-top">
    <div>
      <p class="eyebrow">FOUR BALL</p>
      <h1>4구 당구</h1>
    </div>
    <button type="button" class="new-game-button" onclick={newGame}>새 게임</button>
  </section>

  <section class="score-strip" aria-label="게임 상태">
    <div>
      <span>점수</span>
      <strong>{score}</strong>
    </div>
    <div>
      <span>기회</span>
      <strong>{chances}</strong>
    </div>
    <div>
      <span>최고</span>
      <strong>{myBestScore ?? '-'}</strong>
    </div>
  </section>

  <p
    class="status-line"
    class:good={status === 'scored'}
    class:bad={status === 'game-over' || status === 'miss'}
  >
    {statusText}
  </p>

  <div class="table-wrap">
    <canvas
      bind:this={canvasEl}
      class="billiards-canvas"
      aria-label="4구 당구대"
      onpointerdown={handlePointerDown}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerUp}
      onpointercancel={handlePointerUp}
    ></canvas>
  </div>

  {#if status !== 'game-over'}
    <section class="shot-controls" aria-label="샷 조절">
      <div class="power-control">
        <span>힘</span>
        <div
          class="power-meter"
          aria-label="샷 힘"
          aria-valuemin="10"
          aria-valuemax="100"
          aria-valuenow={power}
        >
          <div class="power-meter-fill" style={`width: ${power}%`}></div>
        </div>
        <strong>{power}</strong>
      </div>
      <div class="spin-control">
        <span>시네루</span>
        <div
          class="spin-meter spin-pad"
          role="slider"
          tabindex="0"
          aria-label="시네루"
          aria-valuemin="-100"
          aria-valuemax="100"
          aria-valuenow={spin}
          onpointerdown={handleSpinPointerDown}
          onpointermove={(event) => {
            if (event.buttons === 1 || event.pointerType === 'touch') updateSpinFromPointer(event);
          }}
        >
          <div class="spin-meter-center"></div>
          <div
            class:left-spin={spin < 0}
            class:right-spin={spin >= 0}
            class="spin-meter-fill"
            style={`width: ${Math.abs(spin) / 2}%; left: ${spin < 0 ? 50 - Math.abs(spin) / 2 : 50}%`}
          ></div>
        </div>
        <strong>{spin}</strong>
      </div>
      <button
        type="button"
        class="shoot-button"
        onclick={lockPowerAndShoot}
        disabled={!canCharge()}
      >
        {status === 'charging' ? '선택' : '힘 재기'}
      </button>
    </section>
  {/if}

  {#if status === 'game-over'}
    <button type="button" class="play-again-button" onclick={newGame}>다시 치기</button>
  {/if}

  {#if isLoggedIn}
    <section class="rank-panel">
      <div class="rank-heading">
        <h2>랭킹</h2>
        {#if rankLoading}<span>불러오는 중</span>{/if}
      </div>
      {#if rankList.length}
        <ol>
          {#each rankList as item}
            <li>
              <span>{item.nickname}</span>
              <strong>{item.score}</strong>
            </li>
          {/each}
        </ol>
      {:else}
        <p>아직 기록이 없습니다.</p>
      {/if}
    </section>
  {:else}
    <p class="login-note">로그인하면 점수 랭킹을 저장합니다.</p>
  {/if}
</div>

<style>
  .billiards-page {
    width: min(100%, 430px);
    margin: 0 auto;
    padding: 14px 12px 28px;
    color: #f8f5e8;
  }

  .billiards-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  .eyebrow {
    margin: 0 0 2px;
    color: #8bd6a6;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0;
  }

  h1,
  h2 {
    margin: 0;
    line-height: 1.1;
  }

  h1 {
    font-size: 1.55rem;
    font-weight: 900;
  }

  .new-game-button,
  .play-again-button {
    border: 0;
    border-radius: 8px;
    background: #f0c05a;
    color: #1d221a;
    font-weight: 800;
    min-height: 40px;
    padding: 0 14px;
  }

  .score-strip {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-bottom: 10px;
  }

  .score-strip > div {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    background: rgba(7, 31, 20, 0.72);
    padding: 9px 10px;
    text-align: center;
  }

  .score-strip span {
    display: block;
    color: #b4ccb8;
    font-size: 0.76rem;
    font-weight: 700;
  }

  .score-strip strong {
    display: block;
    margin-top: 2px;
    font-size: 1.25rem;
    line-height: 1;
  }

  .status-line {
    min-height: 24px;
    margin: 0 0 10px;
    color: #d8e8d4;
    text-align: center;
    font-weight: 700;
  }

  .status-line.good {
    color: #ffe084;
  }

  .status-line.bad {
    color: #ffb1a5;
  }

  .table-wrap {
    border: 7px solid #5d3b22;
    border-radius: 8px;
    background: #163f2b;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.36);
    overflow: hidden;
  }

  .billiards-canvas {
    display: block;
    width: 100%;
    aspect-ratio: 360 / 560;
    touch-action: none;
    user-select: none;
  }

  .shot-controls {
    display: grid;
    grid-template-columns: 1fr 82px;
    gap: 10px;
    align-items: stretch;
    margin-top: 12px;
  }

  .power-control,
  .spin-control {
    display: grid;
    grid-template-columns: 34px 1fr 34px;
    gap: 8px;
    align-items: center;
    min-height: 48px;
    padding: 8px 10px;
    border-radius: 8px;
    background: rgba(7, 31, 20, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #d8e8d4;
    font-weight: 800;
  }

  .power-meter,
  .spin-meter {
    position: relative;
    width: 100%;
    min-width: 0;
    height: 18px;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.16);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
  }

  .spin-meter {
    height: 14px;
  }

  .spin-pad {
    cursor: pointer;
    touch-action: none;
    user-select: none;
  }

  .power-meter-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #69d17c, #f0c05a 58%, #f36b54);
    transition: width 60ms linear;
  }

  .spin-meter-center {
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(50% - 1px);
    width: 2px;
    background: rgba(255, 255, 255, 0.55);
  }

  .spin-meter-fill {
    position: absolute;
    top: 0;
    height: 100%;
    border-radius: inherit;
    transition:
      width 80ms linear,
      left 80ms linear;
  }

  .spin-meter-fill.left-spin {
    background: #77b7ff;
  }

  .spin-meter-fill.right-spin {
    background: #ff9a6a;
  }

  .power-control strong,
  .spin-control strong {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .shoot-button {
    grid-row: span 2;
    min-height: 48px;
    border: 0;
    border-radius: 8px;
    background: #f0c05a;
    color: #1d221a;
    font-weight: 900;
  }

  .shoot-button:disabled {
    opacity: 0.55;
  }

  .play-again-button {
    width: 100%;
    margin-top: 12px;
  }

  .rank-panel {
    margin-top: 16px;
    padding: 13px;
    border-radius: 8px;
    background: rgba(9, 30, 22, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .rank-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .rank-heading h2 {
    font-size: 1rem;
  }

  .rank-heading span,
  .rank-panel p,
  .login-note {
    color: #b4ccb8;
    font-size: 0.86rem;
  }

  .rank-panel ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .rank-panel li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 7px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .rank-panel li:first-child {
    border-top: 0;
  }

  .login-note {
    margin: 14px 0 0;
    text-align: center;
  }
</style>

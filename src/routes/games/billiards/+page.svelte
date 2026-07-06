<script lang="ts">
  import { onMount } from 'svelte';
  import Matter from 'matter-js';
  import {
    BALL_RADIUS,
    BALL_FRICTION_AIR,
    BALL_RESTITUTION,
    BALL_STATIC_FRICTION,
    BALL_SURFACE_FRICTION,
    BILLIARDS_MODES,
    ANGULAR_FRICTION_DECAY,
    ANGULAR_STOP_SPEED,
    POCKET_BALL_CHANCES,
    POCKET_RADIUS,
    CUE_SPIN_ANGULAR_SCALE,
    CUE_SPIN_MIN_SPEED_RATIO,
    CUE_SPIN_STOP_VALUE,
    FOUR_BALL_CHANCES,
    RAIL_RESTITUTION,
    RAIL_THICKNESS,
    RAIL_SURFACE_FRICTION,
    RAIL_CONTACT_SPIN_DAMPING,
    MAX_ROLL_DURATION_MS,
    STOP_SPEED,
    TABLE_HEIGHT,
    TABLE_WIDTH,
    containBallInTable,
    computeBreathingAimAngle,
    computeBallCollisionEnergyScale,
    computeDynamicSpinCurveScale,
    computeDynamicSpinDecay,
    computeDynamicVelocityScale,
    computeRailContactVelocityScale,
    computeRailEnergyScale,
    computePocketClearBonus,
    computePocketShotScore,
    computeShotVelocity,
    computeSpeedRatio,
    computeSpinFromTrack,
    computeSweepingPower,
    evaluateFourBallShot,
    getPocketCenters,
    isBallInPocket,
    shouldSnapStoppedSpeed,
    stopped,
    type ActiveBilliardsMode,
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
  type BallBody = Matter.Body & {
    billiardsRole?: 'cue' | 'red';
    billiardsId?: string;
    billiardsColor?: string;
  };
  type RailBody = Matter.Body & { billiardsRail?: true };

  let { data }: Props = $props();

  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let currentMode = $state<ActiveBilliardsMode>(BILLIARDS_MODES.FOUR_BALL);
  let score = $state(0);
  let chances = $state(FOUR_BALL_CHANCES);
  let status = $state<Status>('aiming');
  let aimAngle = $state(-Math.PI / 2);
  let displayAimAngle = $state(-Math.PI / 2);
  let aimPoint = $state<{ x: number; y: number } | null>(null);
  let aimingStartedAt = 0;
  let isHoldingAim = false;
  let spin = $state(0);
  let spinTipX = $state(0);
  let spinTipY = $state(0);
  let activeSpin = 0;
  let power = $state(55);
  let powerSweepStartedAt = 0;
  let rankList = $state<RankEntry[]>([]);
  let myBestScore = $state<number | null>(null);
  let rankLoading = $state(false);
  let submittedGameOver = false;
  let contacts: ShotContact[] = [];
  let pocketedThisShot = 0;
  let cuePocketedThisShot = false;

  const isLoggedIn = $derived(!!data.session?.user?.email);
  const isPocketBall = $derived(currentMode === BILLIARDS_MODES.POCKET_BALL);
  const modeLabel = $derived(isPocketBall ? '포켓볼' : '4구 당구');
  const remainingObjects = $derived(redBalls.length);
  const statusText = $derived(
    status === 'aiming'
      ? isPocketBall
        ? '공을 포켓에 넣으세요'
        : '당구대에서 조준하고 게이지를 눌러 샷'
      : status === 'charging'
        ? '게이지를 눌러 샷'
        : status === 'rolling'
          ? '공이 멈출 때까지 기다리세요'
          : status === 'scored'
            ? isPocketBall
              ? '포켓 성공'
              : '득점! 한 번 더'
            : status === 'miss'
              ? cuePocketedThisShot
                ? '수구 파울'
                : '아쉽습니다. 다시 조준하세요'
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
  let rollingStartedAt = 0;

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
      friction: BALL_SURFACE_FRICTION,
      frictionStatic: BALL_STATIC_FRICTION,
      frictionAir: BALL_FRICTION_AIR,
      render: { fillStyle: color }
    }) as BallBody;
    ball.billiardsRole = role;
    ball.billiardsId = id;
    ball.billiardsColor = color;
    return ball;
  }

  function makeRail(x: number, y: number, width: number, height: number) {
    const rail = Bodies.rectangle(x, y, width, height, {
      label: 'rail',
      isStatic: true,
      restitution: RAIL_RESTITUTION,
      friction: RAIL_SURFACE_FRICTION,
      render: { fillStyle: '#31533b' }
    }) as RailBody;
    rail.billiardsRail = true;
    return rail;
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
    if (isPocketBall) {
      const rackX = TABLE_WIDTH * 0.5;
      const rackY = TABLE_HEIGHT * 0.28;
      const gap = BALL_RADIUS * 2.08;
      redBalls = [
        makeBall(rackX, rackY, 'red', 'pool-1', '#f0c05a'),
        makeBall(rackX - gap / 2, rackY - gap, 'red', 'pool-2', '#2c6fbb'),
        makeBall(rackX + gap / 2, rackY - gap, 'red', 'pool-3', '#d7352a'),
        makeBall(rackX - gap, rackY - gap * 2, 'red', 'pool-4', '#6a42a6'),
        makeBall(rackX, rackY - gap * 2, 'red', 'pool-5', '#f0782f'),
        makeBall(rackX + gap, rackY - gap * 2, 'red', 'pool-6', '#248f57')
      ];
    } else {
      redBalls = [
        makeBall(TABLE_WIDTH * 0.42, TABLE_HEIGHT * 0.28, 'red', 'red-1', '#d7352a'),
        makeBall(TABLE_WIDTH * 0.58, TABLE_HEIGHT * 0.28, 'red', 'red-2', '#c71920')
      ];
    }

    Composite.add(engine.world, [...walls, cueBall, ...redBalls]);
  }

  function newGame() {
    score = 0;
    chances = isPocketBall ? POCKET_BALL_CHANCES : FOUR_BALL_CHANCES;
    status = 'aiming';
    contacts = [];
    aimAngle = -Math.PI / 2;
    displayAimAngle = -Math.PI / 2;
    aimPoint = null;
    aimingStartedAt = 0;
    isHoldingAim = false;
    spin = 0;
    spinTipX = 0;
    spinTipY = 0;
    activeSpin = 0;
    power = 55;
    powerSweepStartedAt = 0;
    rollingStartedAt = 0;
    submittedGameOver = false;
    pocketedThisShot = 0;
    cuePocketedThisShot = false;
    resetBodies();
  }

  function switchMode(mode: ActiveBilliardsMode) {
    if (currentMode === mode) return;
    currentMode = mode;
    rankList = [];
    myBestScore = null;
    newGame();
    void loadRank();
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

    if (isPocketBall) {
      const shotScore = computePocketShotScore(pocketedThisShot, cuePocketedThisShot);
      if (shotScore > 0) score += shotScore;

      if (redBalls.length === 0) {
        score += computePocketClearBonus(chances);
        status = 'game-over';
        pocketedThisShot = 0;
        cuePocketedThisShot = false;
        void submitScore();
        return;
      }

      if (pocketedThisShot > 0 && !cuePocketedThisShot) {
        status = 'scored';
        pocketedThisShot = 0;
        cuePocketedThisShot = false;
        return;
      }

      chances = Math.max(0, chances - 1);
      if (cuePocketedThisShot) resetCueBall();
      pocketedThisShot = 0;
      cuePocketedThisShot = false;
      if (chances === 0) {
        status = 'game-over';
        void submitScore();
        return;
      }
      status = 'miss';
      return;
    }

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

  function resetCueBall() {
    if (!cueBall || !engine) return;
    Body.setPosition(cueBall, { x: TABLE_WIDTH * 0.5, y: TABLE_HEIGHT * 0.72 });
    Body.setVelocity(cueBall, { x: 0, y: 0 });
    Body.setAngularVelocity(cueBall, 0);
    Composite.add(engine.world, cueBall);
  }

  function recordCueContact(bodyA: BallBody, bodyB: BallBody) {
    const cue =
      bodyA.billiardsRole === 'cue' ? bodyA : bodyB.billiardsRole === 'cue' ? bodyB : null;
    const target = cue === bodyA ? bodyB : bodyA;
    if (!cue || target.billiardsRole !== 'red' || !target.billiardsId) return;
    contacts = [...contacts, { cueRole: 'red', targetId: target.billiardsId }];
  }

  function getBallBody(body: Matter.Body) {
    const ball = body as BallBody;
    return ball.billiardsRole ? ball : null;
  }

  function getRailBody(body: Matter.Body) {
    const rail = body as RailBody;
    return rail.billiardsRail ? rail : null;
  }

  function applyVelocityScale(ball: BallBody, scale: number) {
    Body.setVelocity(ball, {
      x: ball.velocity.x * scale,
      y: ball.velocity.y * scale
    });
  }

  function applyRailCollisionEnergyLoss(bodyA: Matter.Body, bodyB: Matter.Body) {
    const ball = getBallBody(bodyA) ?? getBallBody(bodyB);
    const rail = getRailBody(bodyA) ?? getRailBody(bodyB);
    if (!ball || !rail) return;
    const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
    applyVelocityScale(ball, computeRailEnergyScale(speed));
    Body.setAngularVelocity(ball, ball.angularVelocity * RAIL_CONTACT_SPIN_DAMPING);
    if (ball === cueBall) activeSpin *= RAIL_CONTACT_SPIN_DAMPING;
  }

  function applyRailContactDrag(bodyA: Matter.Body, bodyB: Matter.Body) {
    const ball = getBallBody(bodyA) ?? getBallBody(bodyB);
    const rail = getRailBody(bodyA) ?? getRailBody(bodyB);
    if (!ball || !rail) return;
    const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
    const scale = computeRailContactVelocityScale(speed);
    if (scale === 0) {
      Body.setVelocity(ball, { x: 0, y: 0 });
      Body.setAngularVelocity(ball, 0);
      if (ball === cueBall) activeSpin = 0;
      return;
    }
    applyVelocityScale(ball, scale);
    Body.setAngularVelocity(ball, ball.angularVelocity * RAIL_CONTACT_SPIN_DAMPING);
    if (ball === cueBall) activeSpin *= RAIL_CONTACT_SPIN_DAMPING;
  }

  function applyBallCollisionEnergyLoss(bodyA: Matter.Body, bodyB: Matter.Body) {
    const ballA = getBallBody(bodyA);
    const ballB = getBallBody(bodyB);
    if (!ballA || !ballB) return;
    const relativeVelocity = {
      x: ballA.velocity.x - ballB.velocity.x,
      y: ballA.velocity.y - ballB.velocity.y
    };
    const relativeSpeed = Math.hypot(relativeVelocity.x, relativeVelocity.y);
    if (relativeSpeed <= STOP_SPEED) return;
    const normal = {
      x: ballA.position.x - ballB.position.x,
      y: ballA.position.y - ballB.position.y
    };
    const normalLength = Math.max(1, Math.hypot(normal.x, normal.y));
    const headOnRatio = Math.abs(
      (relativeVelocity.x * normal.x + relativeVelocity.y * normal.y) /
        (relativeSpeed * normalLength)
    );
    const scale = computeBallCollisionEnergyScale(relativeSpeed, headOnRatio);
    applyVelocityScale(ballA, scale);
    applyVelocityScale(ballB, scale);
  }

  function getCanvasPoint(event: PointerEvent) {
    if (!canvasEl) return null;
    const rect = canvasEl.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * TABLE_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * TABLE_HEIGHT
    };
  }

  function canPrepareShot() {
    return status === 'aiming' || status === 'scored' || status === 'miss';
  }

  function canAim() {
    return canPrepareShot();
  }

  function canSpin() {
    return canPrepareShot();
  }

  function canCharge() {
    return canPrepareShot();
  }

  function canShowAimGuide() {
    return canPrepareShot() || status === 'charging';
  }

  function resetAimDrag() {
    isHoldingAim = false;
  }

  function resetSpinTip() {
    spin = 0;
    spinTipX = 0;
    spinTipY = 0;
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
    if (!canSpin()) return;
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    spinTipX = Math.round((x / rect.width) * 100 - 50);
    spinTipY = Math.round(50 - (y / rect.height) * 100);
    spin = computeSpinFromTrack(x, rect.width);
    event.preventDefault();
  }

  function handleSpinPointerDown(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    updateSpinFromPointer(event);
  }

  function handlePowerPointerDown(event: PointerEvent) {
    if (!canCharge()) return;
    event.preventDefault();
    shoot(power);
  }

  function handlePointerDown(event: PointerEvent) {
    if (canAim()) {
      const target = event.currentTarget as HTMLElement;
      target.setPointerCapture(event.pointerId);
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
    resetAimDrag();
  }

  function shoot(selectedPower = power) {
    if (!cueBall || !canCharge()) return;
    isHoldingAim = false;
    power = selectedPower;
    const velocity = computeShotVelocity(aimAngle, selectedPower);
    if (Math.hypot(velocity.x, velocity.y) < 0.1) return;
    contacts = [];
    Body.setVelocity(cueBall, velocity);
    Body.setAngularVelocity(cueBall, spin / CUE_SPIN_ANGULAR_SCALE);
    activeSpin = spin;
    resetSpinTip();
    status = 'rolling';
    rollingStartedAt = performance.now();
    aimPoint = null;
    powerSweepStartedAt = 0;
    resetAimDrag();
  }

  function drawBall(ctx: CanvasRenderingContext2D, ball: BallBody) {
    const role = ball.billiardsRole;
    ctx.beginPath();
    ctx.arc(ball.position.x, ball.position.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle =
      role === 'cue'
        ? '#faf9f1'
        : (ball.billiardsColor ?? (ball.billiardsId === 'red-1' ? '#dc342c' : '#bd1f26'));
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = role === 'cue' ? '#d8d0bc' : '#8e1518';
    ctx.stroke();
    if (role === 'cue') {
      ctx.beginPath();
      ctx.arc(ball.position.x - 3, ball.position.y - 3, 2.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
      ctx.fill();
    } else if (isPocketBall) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.86)';
      ctx.font = 'bold 8px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((ball.billiardsId ?? '').replace('pool-', ''), ball.position.x, ball.position.y);
    }
  }

  function drawPockets(ctx: CanvasRenderingContext2D) {
    if (!isPocketBall) return;
    for (const pocket of getPocketCenters()) {
      ctx.beginPath();
      ctx.arc(pocket.x, pocket.y, POCKET_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#050807';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(240, 192, 90, 0.58)';
      ctx.stroke();
    }
  }

  function drawAim(ctx: CanvasRenderingContext2D) {
    if (!cueBall || !canShowAimGuide()) return;
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
    drawPockets(ctx);
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

  function handlePocketedBalls() {
    if (!isPocketBall || !engine) return;
    let pocketedObject = false;
    for (const ball of [...getTrackedBalls()]) {
      if (!isBallInPocket(ball.position)) continue;
      Body.setVelocity(ball, { x: 0, y: 0 });
      Body.setAngularVelocity(ball, 0);
      Composite.remove(engine.world, ball);
      if (ball === cueBall) {
        cuePocketedThisShot = true;
        activeSpin = 0;
        continue;
      }
      redBalls = redBalls.filter((candidate) => candidate !== ball);
      pocketedThisShot += 1;
      pocketedObject = true;
    }

    if (pocketedObject && redBalls.length === 0 && status === 'rolling') {
      activeSpin = 0;
      rollingStartedAt = 0;
      settleShot();
    }
  }

  function applyDynamicRollingDrag(delta: number) {
    for (const ball of getTrackedBalls()) {
      const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
      if (Math.abs(ball.angularVelocity) <= ANGULAR_STOP_SPEED) {
        Body.setAngularVelocity(ball, 0);
      } else {
        Body.setAngularVelocity(ball, ball.angularVelocity * ANGULAR_FRICTION_DECAY);
      }
      if (shouldSnapStoppedSpeed(speed)) {
        Body.setVelocity(ball, { x: 0, y: 0 });
        Body.setAngularVelocity(ball, 0);
        continue;
      }
      applyVelocityScale(ball, computeDynamicVelocityScale(speed, delta));
    }
  }

  function tick(now: number) {
    if (!engine) return;
    const delta = lastFrame ? Math.min(now - lastFrame, 32) : 16.66;
    lastFrame = now;
    Engine.update(engine, delta);
    handlePocketedBalls();
    keepBallsInsideTable();
    if (status === 'rolling') applyDynamicRollingDrag(delta);

    if (isHoldingAim && canAim()) {
      displayAimAngle = computeBreathingAimAngle(
        aimAngle,
        now - aimingStartedAt,
        now - aimingStartedAt
      );
    }

    if (canPrepareShot()) {
      if (!powerSweepStartedAt) powerSweepStartedAt = now;
      power = computeSweepingPower(now - powerSweepStartedAt);
    } else if (status === 'rolling') {
      powerSweepStartedAt = 0;
    }

    if (status === 'rolling' && cueBall && activeSpin !== 0) {
      const speed = Math.hypot(cueBall.velocity.x, cueBall.velocity.y);
      const spinSpeedRatio = computeSpeedRatio(speed);
      if (speed > STOP_SPEED && spinSpeedRatio >= CUE_SPIN_MIN_SPEED_RATIO) {
        const curve = (activeSpin / 100) * computeDynamicSpinCurveScale(speed) * delta;
        const cos = Math.cos(curve);
        const sin = Math.sin(curve);
        Body.setVelocity(cueBall, {
          x: cueBall.velocity.x * cos - cueBall.velocity.y * sin,
          y: cueBall.velocity.x * sin + cueBall.velocity.y * cos
        });
        activeSpin *= computeDynamicSpinDecay(speed);
        if (Math.abs(activeSpin) < CUE_SPIN_STOP_VALUE) {
          activeSpin = 0;
          Body.setAngularVelocity(cueBall, 0);
        }
      } else {
        activeSpin = 0;
        Body.setAngularVelocity(cueBall, 0);
      }
    }

    if (
      status === 'rolling' &&
      ((rollingStartedAt && now - rollingStartedAt > MAX_ROLL_DURATION_MS) ||
        stopped(getTrackedBalls(), STOP_SPEED))
    ) {
      activeSpin = 0;
      rollingStartedAt = 0;
      settleShot();
    }

    draw();
    frameId = requestAnimationFrame(tick);
  }

  async function loadRank() {
    if (!isLoggedIn) return;
    rankLoading = true;
    try {
      const res = await fetch(`/games/billiards?rank=1&mode=${currentMode}`);
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
        body: JSON.stringify({ mode: currentMode, score })
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

    const handleCollisionStart = (event: Matter.IEventCollision<Matter.Engine>) => {
      for (const pair of event.pairs) {
        recordCueContact(pair.bodyA as BallBody, pair.bodyB as BallBody);
        applyRailCollisionEnergyLoss(pair.bodyA, pair.bodyB);
        applyBallCollisionEnergyLoss(pair.bodyA, pair.bodyB);
      }
    };
    const handleCollisionActive = (event: Matter.IEventCollision<Matter.Engine>) => {
      for (const pair of event.pairs) applyRailContactDrag(pair.bodyA, pair.bodyB);
    };

    Events.on(engine, 'collisionStart', handleCollisionStart);
    Events.on(engine, 'collisionActive', handleCollisionActive);

    void loadRank();
    frameId = requestAnimationFrame(tick);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      if (engine) {
        Events.off(engine, 'collisionStart', handleCollisionStart);
        Events.off(engine, 'collisionActive', handleCollisionActive);
        Composite.clear(engine.world, false);
        Engine.clear(engine);
      }
      engine = null;
    };
  });
</script>

<svelte:head>
  <title>{modeLabel} - dgst.me</title>
</svelte:head>

<div class="billiards-page">
  <section class="billiards-hud" aria-label="게임 상태">
    <div class="hud-title">
      <strong>{modeLabel}</strong>
      <span
        class:good={status === 'scored'}
        class:bad={status === 'game-over' || status === 'miss'}
      >
        {statusText}
      </span>
    </div>
    <div class="hud-stats">
      <span>점수 <strong>{score}</strong></span>
      <span>기회 <strong>{chances}</strong></span>
      {#if isPocketBall}
        <span>남은공 <strong>{remainingObjects}</strong></span>
      {/if}
      <span>최고 <strong>{myBestScore ?? '-'}</strong></span>
    </div>
    <button type="button" class="new-game-button" onclick={newGame}>리셋</button>
  </section>

  <div class="mode-tabs" aria-label="당구 모드">
    <button
      type="button"
      class:active={currentMode === BILLIARDS_MODES.FOUR_BALL}
      onclick={() => switchMode(BILLIARDS_MODES.FOUR_BALL)}
    >
      4구
    </button>
    <button
      type="button"
      class:active={currentMode === BILLIARDS_MODES.POCKET_BALL}
      onclick={() => switchMode(BILLIARDS_MODES.POCKET_BALL)}
    >
      포켓볼
    </button>
  </div>

  <section class="game-shell" aria-label={`${modeLabel} 게임`}>
    <main class="table-wrap">
      <canvas
        bind:this={canvasEl}
        class="billiards-canvas"
        aria-label="4구 당구대"
        onpointerdown={handlePointerDown}
        onpointermove={handlePointerMove}
        onpointerup={handlePointerUp}
        onpointercancel={handlePointerUp}
      ></canvas>
    </main>

    <aside class="bottom-controls" aria-label="당점과 파워">
      <div class="control-block tip-control">
        <span class="control-label">당점</span>
        <div
          class="tip-ball"
          role="slider"
          tabindex="0"
          aria-label="당점"
          aria-valuemin="-100"
          aria-valuemax="100"
          aria-valuenow={spin}
          class:disabled-pad={!canSpin()}
          onpointerdown={(event) => {
            event.stopPropagation();
            handleSpinPointerDown(event);
          }}
          onpointermove={(event) => {
            event.stopPropagation();
            if (event.buttons === 1 || event.pointerType === 'touch') updateSpinFromPointer(event);
          }}
        >
          <div class="tip-cross horizontal"></div>
          <div class="tip-cross vertical"></div>
          <div class="tip-dot" style={`left: ${spinTipX + 50}%; top: ${50 - spinTipY}%;`}></div>
        </div>
      </div>

      <div class="control-block power-control">
        <div class="power-heading">
          <span class="control-label">파워</span>
          <strong>{power}</strong>
        </div>
        <div
          class="power-rail"
          role="slider"
          tabindex="0"
          aria-label="샷 파워"
          aria-valuemin="10"
          aria-valuemax="100"
          aria-valuenow={power}
          class:disabled-pad={!canCharge()}
          onpointerdown={(event) => {
            event.stopPropagation();
            handlePowerPointerDown(event);
          }}
        >
          <div class="power-fill" style={`width: ${power}%;`}></div>
          <div class="power-thumb" style={`left: ${power}%;`}></div>
        </div>
        <button
          type="button"
          class="shot-button"
          onclick={() => shoot(power)}
          disabled={!canCharge()}
        >
          SHOT
        </button>
      </div>
    </aside>
  </section>

  {#if status === 'game-over'}
    <button type="button" class="play-again-button" onclick={newGame}>다시 치기</button>
  {/if}

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

  {#if !isLoggedIn}
    <p class="login-note">로그인하면 점수 랭킹을 저장합니다.</p>
  {/if}
</div>

<style>
  .billiards-page {
    width: min(100%, 520px);
    min-height: 100svh;
    margin: 0 auto;
    padding: 4px 6px 8px;
    color: #f8f5e8;
    position: relative;
  }

  .billiards-hud {
    position: absolute;
    top: 4px;
    left: 4px;
    right: 4px;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 32px;
    padding: 4px 6px;
    border-radius: 8px;
    background: rgba(6, 21, 16, 0.74);
    backdrop-filter: blur(4px);
  }

  .hud-title {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }

  .hud-title strong {
    white-space: nowrap;
    font-size: 0.96rem;
    font-weight: 900;
  }

  .hud-title span {
    color: #d8e8d4;
    font-size: 0.78rem;
    font-weight: 800;
    white-space: nowrap;
  }

  .hud-title .good {
    color: #ffe084;
  }

  .hud-title .bad {
    color: #ffb1a5;
  }

  .hud-stats {
    display: flex;
    gap: 6px;
    color: #b4ccb8;
    font-size: 0.72rem;
    font-weight: 800;
    white-space: nowrap;
  }

  .hud-stats strong {
    color: #f8f5e8;
    font-size: 0.9rem;
  }

  .new-game-button,
  .play-again-button,
  .shot-button {
    border: 0;
    border-radius: 8px;
    font-weight: 900;
  }

  .new-game-button {
    min-height: 28px;
    padding: 0 10px;
    background: #f0c05a;
    color: #1d221a;
  }

  .mode-tabs {
    position: absolute;
    top: 42px;
    left: 50%;
    z-index: 2;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    width: min(210px, calc(100% - 16px));
    transform: translateX(-50%);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 8px;
    overflow: hidden;
    background: rgba(6, 21, 16, 0.74);
    backdrop-filter: blur(4px);
  }

  .mode-tabs button {
    min-height: 30px;
    border: 0;
    background: transparent;
    color: #d8e8d4;
    font-weight: 900;
  }

  .mode-tabs button.active {
    background: #f0c05a;
    color: #1d221a;
  }

  .game-shell {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    min-height: 100svh;
    padding-top: 78px;
  }

  .bottom-controls {
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    gap: 8px;
    width: 100%;
    max-width: 430px;
  }

  .control-block {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    background: rgba(7, 31, 20, 0.72);
    padding: 6px;
  }

  .control-label {
    display: block;
    margin-bottom: 4px;
    color: #d8e8d4;
    font-size: 0.68rem;
    font-weight: 800;
    text-align: center;
  }

  .tip-ball {
    position: relative;
    width: 58px;
    aspect-ratio: 1;
    margin: 0 auto 5px;
    border-radius: 50%;
    background:
      radial-gradient(circle at 34% 28%, rgba(255, 255, 255, 0.95), transparent 18%), #f8f7ef;
    box-shadow:
      inset 0 0 0 2px rgba(26, 33, 25, 0.18),
      0 4px 12px rgba(0, 0, 0, 0.28);
    touch-action: none;
    user-select: none;
  }

  .tip-cross {
    position: absolute;
    background: rgba(180, 36, 38, 0.32);
    pointer-events: none;
  }

  .tip-cross.horizontal {
    left: 13%;
    right: 13%;
    top: calc(50% - 1px);
    height: 2px;
  }

  .tip-cross.vertical {
    top: 13%;
    bottom: 13%;
    left: calc(50% - 1px);
    width: 2px;
  }

  .tip-dot {
    position: absolute;
    width: 12px;
    aspect-ratio: 1;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background: #d9232e;
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.86);
    pointer-events: none;
  }

  .control-block strong {
    display: block;
    text-align: center;
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
  }

  .table-wrap {
    position: relative;
    width: min(100%, calc((100svh - 166px) * 0.643));
    max-width: 430px;
    aspect-ratio: 360 / 560;
    border: 4px solid #5d3b22;
    border-radius: 8px;
    background: #163f2b;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.36);
    overflow: hidden;
  }

  .billiards-canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
    user-select: none;
  }

  .power-rail {
    position: relative;
    width: 100%;
    height: 30px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.15);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
    overflow: hidden;
    touch-action: none;
    user-select: none;
  }

  .power-fill {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    border-radius: inherit;
    background: linear-gradient(90deg, #69d17c, #f0c05a 58%, #f36b54);
  }

  .power-thumb {
    position: absolute;
    top: 50%;
    width: 8px;
    height: 38px;
    transform: translate(-50%, -50%);
    border-radius: 999px;
    background: #f8f5e8;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.36);
  }

  .power-control {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 58px;
    grid-template-rows: auto 1fr;
    gap: 6px 8px;
    align-items: center;
  }

  .power-heading {
    grid-column: 1 / 2;
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  .power-heading .control-label {
    margin: 0;
  }

  .power-rail {
    grid-column: 1 / 2;
  }

  .shot-button {
    grid-column: 2 / 3;
    grid-row: 1 / 3;
    width: 100%;
    min-height: 62px;
    background: #f0c05a;
    color: #1d221a;
  }

  .disabled-pad,
  button:disabled {
    opacity: 0.5;
  }

  .play-again-button {
    width: 100%;
    min-height: 40px;
    margin-top: 8px;
    background: #f0c05a;
    color: #1d221a;
  }

  h2 {
    margin: 0;
    line-height: 1.1;
  }

  .rank-panel {
    margin-top: 10px;
    padding: 10px;
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
    margin: 8px 0 0;
    text-align: center;
  }

  @media (max-width: 420px) {
    .billiards-page {
      width: 100%;
      padding: 4px;
    }

    .billiards-hud {
      flex-wrap: wrap;
      min-height: 30px;
    }

    .game-shell {
      padding-top: 96px;
    }

    .bottom-controls {
      grid-template-columns: 84px minmax(0, 1fr);
      gap: 6px;
    }

    .table-wrap {
      width: min(100%, calc((100svh - 188px) * 0.643));
    }

    .power-rail {
      height: 28px;
    }

    .shot-button {
      min-height: 58px;
    }

    .login-note {
      display: none;
    }

    .rank-panel {
      margin-top: 6px;
      padding: 8px;
    }

    .rank-panel ol {
      display: grid;
      grid-template-columns: 1fr;
    }

    .rank-panel li {
      padding: 5px 0;
      font-size: 0.82rem;
    }
  }
</style>

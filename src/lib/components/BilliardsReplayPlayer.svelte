<script>
  import { onDestroy } from 'svelte';
  import {
    BALL_RADIUS as CURRENT_BALL_RADIUS,
    TABLE_HEIGHT as CURRENT_TABLE_HEIGHT,
    TABLE_WIDTH as CURRENT_TABLE_WIDTH,
    getPocketCenters,
    getPocketRailGeometry
  } from '../../routes/games/billiards/gameUtils';

  let { replay } = $props();
  /** @type {HTMLCanvasElement | null} */
  let canvas = $state(null);
  let playing = $state(false);
  let frameIndex = $state(0);
  let animationFrame = 0;
  let startedAt = 0;

  const shot = $derived(replay?.data ?? replay ?? null);
  const frames = $derived(Array.isArray(shot?.frames) ? shot.frames : []);
  const hasRecordedGeometry = $derived(
    Number.isFinite(shot?.tableWidth) &&
      Number.isFinite(shot?.tableHeight) &&
      Number.isFinite(shot?.ballRadius)
  );
  const tableWidth = $derived(
    Number.isFinite(shot?.tableWidth) ? Math.max(240, Math.min(1000, Number(shot.tableWidth))) : 360
  );
  const tableHeight = $derived(
    Number.isFinite(shot?.tableHeight)
      ? Math.max(320, Math.min(2000, Number(shot.tableHeight)))
      : 560
  );
  const ballRadius = $derived(
    Number.isFinite(shot?.ballRadius) ? Math.max(3, Math.min(30, Number(shot.ballRadius))) : 11.5
  );
  const railThickness = $derived(
    hasRecordedGeometry ? (ballRadius / CURRENT_BALL_RADIUS) * 18 : 12
  );
  const pocketDrawRadius = $derived(
    hasRecordedGeometry ? (ballRadius / CURRENT_BALL_RADIUS) * 12 : 15
  );
  const powerPercent = $derived(Math.max(0, Math.min(100, Number(shot?.power ?? 0))));
  const sideSpin = $derived(Math.max(-100, Math.min(100, Number(shot?.sideSpin ?? 0))));
  const verticalSpin = $derived(Math.max(-100, Math.min(100, Number(shot?.verticalSpin ?? 0))));
  const spinLeft = $derived(50 + sideSpin / 2);
  const spinTop = $derived(50 - verticalSpin / 2);

  /** @param {{ x: number, y: number }} point */
  function scaleRecordedPoint(point) {
    return {
      x: point.x * (tableWidth / CURRENT_TABLE_WIDTH),
      y: point.y * (tableHeight / CURRENT_TABLE_HEIGHT)
    };
  }

  /** @param {CanvasRenderingContext2D} context */
  function drawPocketTable(context) {
    const centers = hasRecordedGeometry
      ? getPocketCenters().map(scaleRecordedPoint)
      : [
          { x: railThickness, y: railThickness },
          { x: tableWidth - railThickness, y: railThickness },
          { x: railThickness, y: tableHeight / 2 },
          { x: tableWidth - railThickness, y: tableHeight / 2 },
          { x: railThickness, y: tableHeight - railThickness },
          { x: tableWidth - railThickness, y: tableHeight - railThickness }
        ];

    context.fillStyle = '#07110c';
    for (const pocket of centers) {
      context.beginPath();
      context.arc(pocket.x, pocket.y, pocketDrawRadius, 0, Math.PI * 2);
      context.fill();
    }

    if (!hasRecordedGeometry) return;
    const geometry = getPocketRailGeometry();
    context.fillStyle = '#31533b';
    for (const jaw of geometry.jaws) {
      const vertices = jaw.vertices.map(scaleRecordedPoint);
      context.beginPath();
      context.moveTo(vertices[0].x, vertices[0].y);
      context.lineTo(vertices[1].x, vertices[1].y);
      context.lineTo(vertices[2].x, vertices[2].y);
      context.closePath();
      context.fill();
    }

    context.strokeStyle = 'rgba(240, 192, 90, 0.72)';
    context.lineWidth = Math.max(1, ballRadius * 0.28);
    context.beginPath();
    for (const rail of geometry.rails) {
      if (rail.side === 'top' || rail.side === 'bottom') {
        const start = scaleRecordedPoint({ x: rail.x - rail.width / 2, y: 0 });
        const end = scaleRecordedPoint({ x: rail.x + rail.width / 2, y: 0 });
        const y = rail.side === 'top' ? railThickness : tableHeight - railThickness;
        context.moveTo(start.x, y);
        context.lineTo(end.x, y);
      } else {
        const start = scaleRecordedPoint({ x: 0, y: rail.y - rail.height / 2 });
        const end = scaleRecordedPoint({ x: 0, y: rail.y + rail.height / 2 });
        const x = rail.side === 'left' ? railThickness : tableWidth - railThickness;
        context.moveTo(x, start.y);
        context.lineTo(x, end.y);
      }
    }
    for (const jaw of geometry.jaws) {
      const face = jaw.face.map(scaleRecordedPoint);
      context.moveTo(face[0].x, face[0].y);
      context.lineTo(face[1].x, face[1].y);
    }
    context.stroke();
  }

  /** @param {{ balls?: Array<{ id?: string, role?: string, color?: string, x: number, y: number }> }} frame */
  function draw(frame) {
    const context = canvas?.getContext('2d');
    if (!context || !frame) return;
    context.clearRect(0, 0, tableWidth, tableHeight);
    context.fillStyle = '#5b2d17';
    context.fillRect(0, 0, tableWidth, tableHeight);
    context.fillStyle = '#167347';
    context.fillRect(
      railThickness,
      railThickness,
      tableWidth - railThickness * 2,
      tableHeight - railThickness * 2
    );
    if (shot?.mode === 'pocket-ball') {
      drawPocketTable(context);
    } else {
      context.strokeStyle = 'rgba(255,255,255,.16)';
      context.lineWidth = 2;
      context.strokeRect(
        railThickness,
        railThickness,
        tableWidth - railThickness * 2,
        tableHeight - railThickness * 2
      );
    }

    for (const ball of frame.balls ?? []) {
      context.save();
      context.shadowColor = 'rgba(0,0,0,.45)';
      context.shadowBlur = ballRadius * 0.43;
      context.shadowOffsetY = ballRadius * 0.17;
      context.fillStyle = ball.color || '#d7352a';
      context.beginPath();
      context.arc(ball.x, ball.y, ballRadius, 0, Math.PI * 2);
      context.fill();
      context.shadowColor = 'transparent';
      context.strokeStyle = 'rgba(0,0,0,.32)';
      context.lineWidth = Math.max(1, ballRadius * 0.13);
      context.stroke();
      context.fillStyle = 'rgba(255,255,255,.55)';
      context.beginPath();
      context.arc(
        ball.x - ballRadius * 0.3,
        ball.y - ballRadius * 0.35,
        ballRadius * 0.23,
        0,
        Math.PI * 2
      );
      context.fill();
      context.restore();
    }
  }

  function stop() {
    playing = false;
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  /** @param {number} now */
  function tick(now) {
    if (!playing || frames.length === 0) return;
    const elapsed = now - startedAt;
    while (frameIndex + 1 < frames.length && frames[frameIndex + 1].at <= elapsed) {
      frameIndex += 1;
    }
    draw(frames[frameIndex]);
    if (frameIndex >= frames.length - 1 && elapsed >= frames[frames.length - 1].at) {
      stop();
      return;
    }
    animationFrame = requestAnimationFrame(tick);
  }

  function play() {
    if (frames.length < 2 || playing) return;
    frameIndex = 0;
    startedAt = performance.now();
    playing = true;
    draw(frames[0]);
    animationFrame = requestAnimationFrame(tick);
  }

  $effect(() => {
    const firstFrame = frames[0];
    if (!canvas || !firstFrame) return;
    stop();
    frameIndex = 0;
    draw(firstFrame);
  });

  onDestroy(stop);
</script>

{#if shot && frames.length > 1}
  <section class="replay-card" aria-label="당구 리플레이">
    <div class="replay-heading">
      <strong><span aria-hidden="true">🎱</span> 당구 리플레이</strong>
      <span>{shot.mode === 'four-ball' ? '4구' : '포켓볼'} · {shot.outcome}</span>
    </div>
    <canvas bind:this={canvas} width={tableWidth} height={tableHeight} aria-label="당구 샷 궤적"
    ></canvas>
    <div class="replay-shot-visuals">
      <div class="replay-spin-visual" aria-label="리플레이 당점">
        <div class="visual-heading">
          <span>당점</span>
        </div>
        <div
          class="replay-spin-ball"
          role="img"
          aria-label={`좌우 당점 ${sideSpin}, 상하 당점 ${verticalSpin}`}
        >
          <span class="spin-cross horizontal"></span>
          <span class="spin-cross vertical"></span>
          <span class="replay-spin-dot" style="left: {spinLeft}%; top: {spinTop}%"></span>
        </div>
      </div>

      <div class="replay-power-visual" aria-label="리플레이 파워">
        <div class="visual-heading">
          <span>파워</span>
        </div>
        <div
          class="replay-power-track"
          role="meter"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={powerPercent}
        >
          <span class="replay-power-fill" style="width: {powerPercent}%"></span>
          <span class="replay-power-marker" style="left: {powerPercent}%"></span>
        </div>
      </div>
    </div>
    <button type="button" onclick={play} disabled={playing}>
      {playing ? '재생 중…' : 'REPLAY'}
    </button>
  </section>
{/if}

<style>
  .replay-card {
    display: grid;
    width: min(100%, 390px);
    gap: 9px;
    margin: 0 auto 18px;
    padding: 12px;
    border: 1px solid rgba(240, 192, 90, 0.38);
    border-radius: 14px;
    background: #0c281d;
    color: #f8f5e8;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.2);
  }

  .replay-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .replay-heading span {
    color: #b4ccb8;
    font-size: 0.76rem;
    font-weight: 700;
  }

  canvas {
    width: min(100%, 270px);
    height: auto;
    margin: 0 auto;
    border-radius: 8px;
  }

  .replay-shot-visuals {
    display: grid;
    grid-template-columns: 104px minmax(0, 1fr);
    align-items: stretch;
    gap: 10px;
  }

  .replay-spin-visual,
  .replay-power-visual {
    display: grid;
    align-content: center;
    gap: 7px;
    padding: 9px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    background: rgba(2, 16, 10, 0.42);
  }

  .visual-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .visual-heading span {
    color: #b4ccb8;
    font-size: 0.68rem;
    font-weight: 700;
  }

  .replay-spin-ball {
    position: relative;
    width: 62px;
    height: 62px;
    margin: 0 auto;
    overflow: hidden;
    border: 3px solid #d9d3c5;
    border-radius: 50%;
    clip-path: circle(50% at 50% 50%);
    background: radial-gradient(circle at 35% 28%, #fff 0 12%, #eee8da 45%, #bdb7aa 100%);
    box-shadow:
      inset -5px -7px 10px rgba(37, 32, 22, 0.22),
      0 4px 10px rgba(0, 0, 0, 0.3);
  }

  .spin-cross {
    position: absolute;
    background: rgba(35, 38, 34, 0.26);
  }

  .spin-cross.horizontal {
    top: 50%;
    right: 8px;
    left: 8px;
    height: 1px;
  }

  .spin-cross.vertical {
    top: 8px;
    bottom: 8px;
    left: 50%;
    width: 1px;
  }

  .replay-spin-dot {
    position: absolute;
    width: 11px;
    height: 11px;
    border: 2px solid #fff5d8;
    border-radius: 50%;
    background: #e54832;
    box-shadow: 0 2px 6px rgba(72, 13, 5, 0.58);
    transform: translate(-50%, -50%);
  }

  .replay-power-track {
    position: relative;
    height: 30px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.28);
  }

  .replay-power-fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: inherit;
    background: linear-gradient(90deg, #62d178, #f0c05a 58%, #f36b54);
  }

  .replay-power-marker {
    position: absolute;
    top: 50%;
    width: 4px;
    height: 38px;
    border: 1px solid rgba(255, 255, 255, 0.8);
    border-radius: 3px;
    background: #f8f5e8;
    box-shadow: 0 0 7px rgba(255, 255, 255, 0.7);
    transform: translate(-50%, -50%);
  }

  @media (max-width: 360px) {
    .replay-shot-visuals {
      grid-template-columns: 92px minmax(0, 1fr);
      gap: 7px;
    }

    .replay-spin-visual,
    .replay-power-visual {
      padding: 7px;
    }
  }

  button {
    min-height: 38px;
    border: 1px solid rgba(240, 192, 90, 0.55);
    border-radius: 9px;
    background: #f0c05a;
    color: #1d221a;
    font-weight: 900;
  }

  button:disabled {
    opacity: 0.72;
  }
</style>

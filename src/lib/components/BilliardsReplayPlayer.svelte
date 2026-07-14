<script>
  import { onMount } from 'svelte';

  let { replay } = $props();
  /** @type {HTMLCanvasElement | null} */
  let canvas = $state(null);
  let playing = $state(false);
  let frameIndex = $state(0);
  let animationFrame = 0;
  let startedAt = 0;

  const shot = $derived(replay?.data ?? replay ?? null);
  const frames = $derived(Array.isArray(shot?.frames) ? shot.frames : []);

  /** @param {{ balls?: Array<{ id?: string, role?: string, color?: string, x: number, y: number }> }} frame */
  function draw(frame) {
    const context = canvas?.getContext('2d');
    if (!context || !frame) return;
    context.clearRect(0, 0, 360, 560);
    context.fillStyle = '#5b2d17';
    context.fillRect(0, 0, 360, 560);
    context.fillStyle = '#167347';
    context.fillRect(12, 12, 336, 536);
    context.strokeStyle = 'rgba(255,255,255,.16)';
    context.lineWidth = 2;
    context.strokeRect(12, 12, 336, 536);

    if (shot?.mode === 'pocket-ball') {
      context.fillStyle = '#07110c';
      for (const [x, y] of [
        [12, 12],
        [348, 12],
        [12, 280],
        [348, 280],
        [12, 548],
        [348, 548]
      ]) {
        context.beginPath();
        context.arc(x, y, 15, 0, Math.PI * 2);
        context.fill();
      }
    }

    for (const ball of frame.balls ?? []) {
      context.save();
      context.shadowColor = 'rgba(0,0,0,.45)';
      context.shadowBlur = 5;
      context.shadowOffsetY = 2;
      context.fillStyle = ball.color || '#d7352a';
      context.beginPath();
      context.arc(ball.x, ball.y, 11.5, 0, Math.PI * 2);
      context.fill();
      context.shadowColor = 'transparent';
      context.strokeStyle = 'rgba(0,0,0,.32)';
      context.lineWidth = 1.5;
      context.stroke();
      context.fillStyle = 'rgba(255,255,255,.55)';
      context.beginPath();
      context.arc(ball.x - 3.5, ball.y - 4, 2.6, 0, Math.PI * 2);
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

  onMount(() => {
    draw(frames[0]);
    return stop;
  });
</script>

{#if shot && frames.length > 1}
  <section class="replay-card" aria-label="당구 리플레이">
    <div class="replay-heading">
      <strong>당구 리플레이</strong>
      <span>{shot.mode === 'four-ball' ? '4구' : '포켓볼'} · {shot.outcome}</span>
    </div>
    <canvas bind:this={canvas} width="360" height="560" aria-label="당구 샷 궤적"></canvas>
    <div class="replay-meta">
      <span>파워 {shot.power}</span>
      <span>당점 좌우 {shot.sideSpin}</span>
      <span>상하 {shot.verticalSpin}</span>
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

  .replay-heading,
  .replay-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .replay-heading span,
  .replay-meta {
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

<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import GameRankingRow from '$lib/components/GameRankingRow.svelte';
  import { Confetti } from 'svelte-confetti';
  import type { PageData } from './$types';
  import { swalFire } from '$lib/util/swal.js';
  import {
    SIZE,
    COLORS,
    emptyBoard,
    drawHand,
    canPlace,
    hasMove,
    placePiece,
    rotatePiece
  } from './gameUtils';
  import type { Piece } from './gameUtils';

  let { data }: { data: PageData } = $props();
  const isLoggedIn = $derived(!!data.session?.user?.email);
  type Ranking = { _id: string; nickname: string; score: number; photo?: string };
  let rank = $state<Ranking[]>([]);
  let myBest = $state<number | null>(null);
  let rankLoading = $state(false);
  let rankError = $state('');
  let saving = $state(false);
  let saveError = $state('');
  let savedScore = 0;
  let pendingSave: Promise<boolean> | null = null;
  let rankRequest = 0;
  let celebrationScore = $state<number | null>(null);
  let celebrationTimer: ReturnType<typeof setTimeout> | undefined;
  let reduceMotion = $state(false);
  const BEST_KEY = 'dgst_block_blast_best';
  let board = $state(emptyBoard());
  let hand = $state<(Piece | null)[]>([]);
  let score = $state(0);
  let best = $state(0);
  let combo = $state(0);
  let totalLines = $state(0);
  let selected = $state<number | null>(null);
  let hover = $state<{ row: number; col: number } | null>(null);
  let over = $state(false);
  let ready = $state(false);
  let resetting = $state(false);
  let message = $state('블록을 선택하고 보드에 놓아 보세요.');
  let flashes = $state<number[]>([]);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  let boardElement: HTMLDivElement;
  let suppressClick = false;
  let drag = $state<{
    id: number;
    x: number;
    y: number;
    startX: number;
    startY: number;
    anchorX: number;
    anchorY: number;
    pointerType: string;
    moved: boolean;
  } | null>(null);
  const piece = $derived(selected === null ? null : hand[selected]);
  const valid = $derived(!!piece && !!hover && canPlace(board, piece, hover.row, hover.col));
  const preview = $derived.by(() => {
    if (!piece || !hover) return [];
    const origin = hover;
    return piece.cells.flatMap((row, y) =>
      row.flatMap((cell, x) => {
        const r = origin.row + y;
        const c = origin.col + x;
        return cell && r >= 0 && r < SIZE && c >= 0 && c < SIZE ? [r * SIZE + c] : [];
      })
    );
  });

  onMount(() => {
    try {
      const saved = Number(localStorage.getItem(BEST_KEY));
      best = Number.isSafeInteger(saved) && saved >= 0 ? saved : 0;
    } catch {
      /* Storage may be unavailable in private browsers. */
    }
    hand = drawHand();
    ready = true;
    reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isLoggedIn) void loadRank();
    return () => {
      clearTimeout(flashTimer);
      clearTimeout(celebrationTimer);
    };
  });

  async function loadRank(newScore?: number) {
    if (!isLoggedIn) return;
    const requestId = ++rankRequest;
    const previousLeader = rank[0];
    rankLoading = true;
    rankError = '';
    try {
      const response = await fetch(resolve('/games/block-blast') + '?rank=1', {
        cache: 'no-store'
      });
      if (!response.ok) throw new Error('순위 조회 실패');
      const result = await response.json();
      if (requestId !== rankRequest) return;
      rank = result.rank;
      myBest = result.myBest?.score ?? null;
      const leader = rank[0];
      if (
        newScore &&
        leader?._id === data.session?.user?.email &&
        leader.score === newScore &&
        (previousLeader?._id !== leader._id || newScore > previousLeader.score)
      ) {
        celebrationScore = newScore;
        clearTimeout(celebrationTimer);
        celebrationTimer = setTimeout(() => {
          celebrationScore = null;
        }, 6500);
      }
    } catch {
      if (requestId === rankRequest)
        rankError = '순위를 불러오지 못했어요. 새로고침으로 다시 시도해 주세요.';
    } finally {
      if (requestId === rankRequest) rankLoading = false;
    }
  }

  function submitScore(finalScore: number): Promise<boolean> {
    if (!isLoggedIn || finalScore <= savedScore) return Promise.resolve(true);
    if (pendingSave)
      return pendingSave.then((success) => (success ? submitScore(finalScore) : false));
    saving = true;
    saveError = '';
    pendingSave = (async () => {
      try {
        const response = await fetch(resolve('/games/block-blast'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ score: finalScore })
        });
        if (!response.ok) throw new Error('점수 저장 실패');
        savedScore = finalScore;
        await loadRank(finalScore);
        return true;
      } catch {
        saveError = '점수를 저장하지 못했어요. 다시 시도해 주세요.';
        return false;
      } finally {
        saving = false;
        pendingSave = null;
      }
    })();
    return pendingSave;
  }

  function place(row: number, col: number) {
    if (!piece || selected === null || over || resetting) return;
    const result = placePiece(board, piece, row, col, combo);
    if (!result) {
      message = '여기에는 놓을 수 없어요. 빈 공간을 찾아 보세요.';
      return;
    }
    board = result.board;
    score += result.points;
    combo = result.combo;
    totalLines += result.lines;
    flashes = result.cleared;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      flashes = [];
    }, 450);
    message = result.perfect
      ? `ALL CLEAR! +${result.points}`
      : result.lines
        ? `${result.lines}줄 제거! ${combo > 1 ? `${combo} COMBO · ` : ''}+${result.points}`
        : `+${result.points} · 가로 또는 세로 한 줄을 채워 보세요.`;
    hand = hand.map((p, i) => (i === selected ? null : p));
    if (hand.every((p) => p === null)) hand = drawHand();
    selected = null;
    hover = null;
    over = !hasMove(board, hand);
    if (over) {
      message = '놓을 수 있는 블록이 없어요. 다시 도전해 보세요!';
      void submitScore(score);
    }
    if (score > best) {
      best = score;
      try {
        localStorage.setItem(BEST_KEY, String(best));
      } catch {
        /* Keep playing. */
      }
    }
  }

  function rotateSelected() {
    if (!piece || selected === null || over || resetting || drag) return;
    hand = hand.map((p, i) => (i === selected && p ? rotatePiece(p) : p));
    hover = null;
    message = '블록을 시계 방향으로 회전했어요. 원하는 칸에 놓아 보세요.';
  }

  async function restart() {
    if (resetting) return;
    resetting = true;
    try {
      if (score && !over) {
        const result = await swalFire({
          title: '새 게임을 시작할까요?',
          text: '진행 중인 점수는 초기화돼요. 최고점은 유지돼요.',
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: '새 게임',
          cancelButtonText: '계속하기'
        });
        if (!result.isConfirmed) return;
      }
      if (!(await submitScore(score))) return;
      savedScore = 0;
      saveError = '';
      board = emptyBoard();
      hand = drawHand();
      score = 0;
      combo = 0;
      totalLines = 0;
      selected = null;
      hover = null;
      drag = null;
      over = false;
      flashes = [];
      clearTimeout(flashTimer);
      message = '블록을 선택하고 보드에 놓아 보세요.';
    } finally {
      resetting = false;
    }
  }

  function beginDrag(event: PointerEvent, index: number) {
    if (event.button !== 0 || !hand[index] || over || resetting || drag) return;
    selected = index;
    suppressClick = false;
    hover = null;
    const target = event.currentTarget as HTMLButtonElement;
    const shape = target.querySelector('.shape')!.getBoundingClientRect();
    const p = hand[index]!;
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      pointerType: event.pointerType,
      moved: false,
      anchorX: Math.max(
        0,
        Math.min(
          p.cells[0].length - 1,
          Math.floor((event.clientX - shape.left) / (shape.width / p.cells[0].length))
        )
      ),
      anchorY: Math.max(
        0,
        Math.min(
          p.cells.length - 1,
          Math.floor((event.clientY - shape.top) / (shape.height / p.cells.length))
        )
      )
    };
    target.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.id) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 6) drag.moved = true;
    if (!drag.moved) return;
    const first = boardElement.querySelector('button')!.getBoundingClientRect();
    const last = boardElement.querySelector('button:last-child')!.getBoundingClientRect();
    const step = (last.left - first.left) / (SIZE - 1);
    // Offset the target before checking board bounds so bottom rows remain reachable
    // with the finger below the board, without snapping at the bottom edge.
    const lift = drag.pointerType === 'touch' ? 64 : 0;
    const row = Math.floor((event.clientY - first.top - lift) / step);
    const col = Math.floor((event.clientX - first.left) / step);
    const maxRow = piece ? SIZE - piece.cells.length : SIZE - 1;
    const rowOffset = piece ? Math.max(0, Math.min(maxRow, row - drag.anchorY)) : 0;
    hover =
      row >= 0 && row < SIZE && col >= 0 && col < SIZE
        ? { row: rowOffset, col: col - drag.anchorX }
        : null;
  }

  function endDrag(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.id) return;
    moveDrag(event);
    suppressClick = drag.moved;
    if (drag.moved && hover) place(hover.row, hover.col);
    drag = null;
    hover = null;
  }

  function cancelDrag(event: PointerEvent) {
    if (drag?.id !== event.pointerId) return;
    drag = null;
    hover = null;
  }
</script>

<svelte:head>
  <title>Block Blast · DGST</title>
  <meta
    name="description"
    content="8×8 보드에 블록을 놓고 줄을 지우는 블록 퍼즐. 시간 제한 없이 최고점에 도전하세요."
  />
</svelte:head>

<svelte:window onpointermove={moveDrag} onpointerup={endDrag} onpointercancel={cancelDrag} />

<div class="blast-page container py-4">
  <div class="blast-layout">
    <section class="game-card" aria-label="Block Blast 게임">
      <header class="game-header">
        <div>
          <span class="eyebrow">BLOCK PUZZLE</span>
          <h1>Block <span>Blast</span></h1>
        </div>
        <button class="restart" onclick={restart} disabled={!ready || resetting}>새 게임</button>
      </header>
      <div class="scores">
        <div><span>점수</span><strong data-testid="score">{score.toLocaleString()}</strong></div>
        <div>
          <span>이 브라우저 최고점</span><strong class="best">{best.toLocaleString()}</strong>
        </div>
        <div><span>제거한 줄</span><strong>{totalLines}</strong></div>
      </div>
      <div class="board-wrap">
        <div class="board" bind:this={boardElement} aria-label="8×8 블록 보드">
          {#each board as cell, i (i)}
            <button
              class="cell"
              class:filled={cell > 0}
              class:preview={preview.includes(i)}
              class:invalid={preview.includes(i) && !valid}
              class:flash={flashes.includes(i)}
              style:--block-color={COLORS[
                (preview.includes(i) && piece ? piece.color : cell) - 1
              ] ?? 'transparent'}
              aria-label={`${Math.floor(i / SIZE) + 1}행 ${(i % SIZE) + 1}열${cell ? ' 채워짐' : ' 빈칸'}`}
              disabled={!ready || over || resetting}
              onpointerenter={() => {
                if (!drag) hover = { row: Math.floor(i / SIZE), col: i % SIZE };
              }}
              onpointerleave={() => {
                if (!drag) hover = null;
              }}
              onfocus={() => {
                hover = { row: Math.floor(i / SIZE), col: i % SIZE };
              }}
              onblur={() => {
                if (!drag) hover = null;
              }}
              onclick={() => place(Math.floor(i / SIZE), i % SIZE)}
            ></button>
          {/each}
        </div>
        {#if over}
          <div class="game-over">
            <span class="eyebrow">잘했어요!</span>
            <h2>GAME OVER</h2>
            <p>최종 점수 <strong>{score.toLocaleString()}</strong></p>
            <button onclick={restart} disabled={resetting}>다시 도전</button>
          </div>
        {/if}
      </div>
      <p class="feedback" class:celebrate={combo > 0} role="status">{message}</p>
      {#if saving}<p class="save-status" role="status">점수 저장 중…</p>{/if}
      {#if saveError}
        <p class="save-status" role="alert">
          {saveError}
          <button onclick={() => submitScore(score)} disabled={saving}>저장 재시도</button>
        </p>
      {/if}
      <div class="hand" aria-label="사용할 블록">
        {#each hand as p, i (i)}
          <button
            class="piece-slot"
            class:selected={selected === i}
            disabled={!p || over || resetting}
            aria-label={`블록 ${i + 1}${!p ? ' 사용 완료' : ''}`}
            aria-pressed={selected === i}
            onpointerdown={(e) => beginDrag(e, i)}
            onclick={(event) => {
              if (p && !over && (event.detail === 0 || !suppressClick)) selected = i;
            }}
          >
            {#if p}
              <span
                class="shape"
                style:grid-template-columns={`repeat(${p.cells[0].length}, 1fr)`}
                style:--block-color={COLORS[p.color - 1]}
              >
                {#each p.cells as row, y (y)}{#each row as cell, x (x)}
                    <span class="mini-cell" class:occupied={!!cell}></span>
                  {/each}{/each}
              </span>
            {:else}<span class="used">✓</span>{/if}
          </button>
        {/each}
      </div>
      <div class="rotation-controls">
        <button
          class="rotate-button"
          onclick={rotateSelected}
          disabled={!piece || over || resetting || !!drag}
        >
          ↻ 회전
        </button>
        <span>블록 선택 후 90°씩 회전</span>
      </div>
      <p class="control-help">끌어서 놓기 · 블록 선택 후 빈칸 클릭도 가능</p>
    </section>
    <aside class="instructions">
      <section class="ranking" aria-label="Block Blast 순위">
        <div class="ranking-heading">
          <h2>순위 Top 10</h2>
          {#if isLoggedIn}<button onclick={() => loadRank()} disabled={rankLoading}>새로고침</button
            >{/if}
        </div>
        <p>전체 기간 · 1인 1최고점</p>
        {#if isLoggedIn}
          <p>내 최고점: <strong>{myBest?.toLocaleString() ?? '—'}</strong></p>
          {#if rankError}<p role="alert">{rankError}</p>
          {:else if rankLoading && !rank.length}<p role="status">순위 불러오는 중…</p>
          {:else if !rank.length}<p>아직 기록이 없어요. 첫 기록에 도전해 보세요!</p>{/if}
          <ol class="ranking-list">
            {#each rank as player, index (player._id)}
              <GameRankingRow
                {index}
                nickname={player.nickname}
                photo={player.photo}
                score={player.score.toLocaleString()}
                current={player._id === data.session?.user?.email}
              />
            {/each}
          </ol>
          <p>게임 종료 또는 새 게임 시작 시 점수가 저장돼요.</p>
        {:else}
          <p>로그인하면 순위와 내 최고점을 볼 수 있어요.</p>
          <a href={resolve('/login')}>로그인</a>
        {/if}
      </section>
      <span class="eyebrow">HOW TO PLAY</span>
      <h2>채우고, 지우고,<br />한 번 더.</h2>
      <p>시간 제한 없이 즐기는 블록 퍼즐.<br />다음 블록을 위한 공간을 남겨 보세요.</p>
      <ol>
        <li>
          <strong>블록 놓기</strong><span
            >아래 블록을 보드의 빈 공간에 놓으세요. 선택한 블록을 회전 버튼으로 돌릴 수 있어요.</span
          >
        </li>
        <li>
          <strong>한 줄 완성</strong><span
            >가로 또는 세로 8칸을 채우면 사라져요. 여러 줄을 한 번에 지우면 보너스!</span
          >
        </li>
        <li>
          <strong>연속 제거</strong><span
            >매번 줄을 지우면 콤보가 올라가요. 보드를 모두 비우면 300점 추가!</span
          >
        </li>
      </ol>
      <div class="note">
        블록 3개를 모두 쓰면 새 블록이 나와요. 남은 블록을 회전해도 하나도 놓을 수 없으면 게임 종료.
      </div>
      <p class="save-note">
        로그인한 게임 기록은 순위에 저장돼요. 브라우저 최고점은 별도로 유지돼요.
      </p>
    </aside>
  </div>
</div>

{#if celebrationScore !== null}
  <div class="champion" role="status">
    <strong>🏆 블록퍼즐 1등!</strong>
    <span>{celebrationScore.toLocaleString()}점 · 축하해요!</span>
    <button
      onclick={() => {
        celebrationScore = null;
      }}
      aria-label="1등 축하 닫기">×</button
    >
  </div>
  {#if !reduceMotion}
    <div class="champion-fireworks" aria-hidden="true">
      <Confetti
        x={[-5, 5]}
        y={[0, 0.1]}
        amount={180}
        duration={4000}
        delay={[0, 1800]}
        fallDistance="100vh"
      />
    </div>
  {/if}
{/if}

{#if drag?.moved && piece}
  <div
    class="drag-shape shape"
    class:touch-drag={drag.pointerType === 'touch'}
    aria-hidden="true"
    style:left={`${drag.pointerType === 'touch' ? drag.x - (drag.anchorX + 0.5) * 25 : drag.x + 18}px`}
    style:top={`${drag.pointerType === 'touch' ? drag.y - piece.cells.length * 25 - 52 : drag.y - 75}px`}
    style:grid-template-columns={`repeat(${piece.cells[0].length}, 1fr)`}
    style:--block-color={COLORS[piece.color - 1]}
  >
    {#each piece.cells as row, y (y)}{#each row as cell, x (x)}<span
          class="mini-cell"
          class:occupied={!!cell}
        ></span>{/each}{/each}
  </div>
{/if}

<style>
  /* Override the site's DOS theme reset within this game only. */
  .blast-page {
    color: #e9efff;
  }
  .blast-layout {
    display: grid;
    grid-template-columns: minmax(0, 540px) minmax(230px, 320px);
    gap: 32px;
    justify-content: center;
    align-items: start;
  }
  .game-card {
    background: linear-gradient(150deg, #192c50, #101b33);
    padding: 24px;
    border-radius: 24px !important;
    box-shadow: 0 16px 40px #101b3326 !important;
  }
  .game-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 20px;
  }
  .eyebrow {
    color: #91a7ce;
    font-size: 0.65rem !important;
    font-weight: 800 !important;
    letter-spacing: 0.17em;
  }
  h1 {
    font-size: clamp(1.5rem, 5vw, 2rem) !important;
    margin: 3px 0 0;
    font-weight: 900 !important;
    letter-spacing: -0.04em;
  }
  h1 span {
    color: #ffb84d;
    font-size: inherit !important;
    font-weight: inherit !important;
  }
  button {
    color: inherit;
    font: inherit;
  }
  .restart {
    background: #ffffff0d;
    border: 1px solid #ffffff26;
    padding: 8px 13px;
    border-radius: 10px !important;
    font-size: 0.8rem !important;
    white-space: nowrap;
  }
  .scores {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 10px;
    margin-bottom: 18px;
  }
  .scores > div {
    background: #09142a66;
    border-radius: 12px !important;
    padding: 10px 12px;
  }
  .scores span {
    display: block;
    font-size: 0.7rem !important;
    color: #91a7ce;
  }
  .scores strong {
    font-size: clamp(1.05rem, 4vw, 1.5rem) !important;
    font-weight: 800 !important;
    font-variant-numeric: tabular-nums;
  }
  .scores .best {
    color: #ffca73;
  }
  .board-wrap {
    position: relative;
    max-width: min(100%, 46vh);
    margin: 0 auto;
  }
  .board {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 4px;
    background: #0c152a;
    padding: 9px;
    border-radius: 14px !important;
  }
  .cell {
    border: 0;
    border-radius: 4px !important;
    background: #223453;
    aspect-ratio: 1;
    padding: 0;
    min-width: 0;
    transition:
      background 100ms,
      box-shadow 100ms;
    touch-action: manipulation;
  }
  .filled,
  .occupied {
    background: var(--block-color);
    box-shadow:
      inset 2px 2px 0 #ffffff45,
      inset -2px -3px 0 #00000025 !important;
  }
  .cell.preview {
    background: var(--block-color);
    opacity: 0.65;
    box-shadow: inset 0 0 0 2px #ffffffaa !important;
  }
  .cell.invalid {
    background: #e6576a;
  }
  .cell.flash {
    animation: clear-flash 450ms ease-out;
  }
  button:focus-visible {
    outline: 3px solid #ffca73;
    outline-offset: 2px;
  }
  .feedback {
    min-height: 40px;
    margin: 14px 0 4px;
    text-align: center;
    font-size: 0.8rem !important;
    color: #a4b6d5;
  }
  .celebrate {
    color: #ffca73;
    font-weight: 800 !important;
  }
  .hand {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .piece-slot {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 116px;
    padding: 10px;
    background: #ffffff05;
    border: 1px solid #ffffff12;
    border-radius: 13px !important;
    touch-action: none;
    user-select: none;
    cursor: grab;
  }
  .piece-slot.selected {
    background: #ffffff0c;
    border-color: #ffca73;
  }
  .piece-slot:disabled {
    cursor: default;
  }
  .shape {
    display: grid;
    gap: 3px;
    pointer-events: none;
  }
  .mini-cell {
    width: clamp(14px, 3.8vw, 22px);
    aspect-ratio: 1;
    border-radius: 3px !important;
  }
  .used {
    color: #567092;
    font-size: 1.8rem !important;
  }
  .rotation-controls {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 12px;
    margin-top: 14px;
  }
  .rotate-button {
    background: #ffb84d;
    color: #17243e;
    border: 0;
    border-radius: 10px !important;
    padding: 10px 20px;
    font-size: 0.85rem !important;
    font-weight: 800 !important;
    touch-action: manipulation;
  }
  .rotate-button:disabled {
    opacity: 0.4;
  }
  .rotation-controls span {
    color: #91a7ce;
    font-size: 0.7rem !important;
  }
  .control-help {
    color: #91a7ce;
    font-size: 0.7rem !important;
    text-align: center;
    margin: 14px 0 0;
  }
  .game-over {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: #0c152aeb;
    border-radius: 14px !important;
  }
  .game-over h2 {
    color: #ffca73;
    font-size: clamp(1.25rem, 5vw, 2rem) !important;
    font-weight: 900 !important;
    margin: 10px 0;
  }
  .game-over button {
    border: 0;
    background: #ffb84d;
    color: #17243e;
    border-radius: 12px !important;
    font-weight: 800 !important;
    padding: 12px 30px;
  }
  .instructions {
    color: #31415d;
    padding: 28px 8px;
  }
  .instructions .eyebrow {
    color: #59759e;
  }
  .instructions h2 {
    font-size: 2rem !important;
    font-weight: 900 !important;
    line-height: 1.3;
    letter-spacing: -0.05em;
    margin: 12px 0 18px;
  }
  .instructions p {
    font-size: 0.85rem !important;
    line-height: 1.8;
    color: #61708a;
  }
  .instructions > ol {
    list-style: none;
    counter-reset: steps;
    padding: 0;
    margin: 24px 0;
  }
  .instructions > ol > li {
    counter-increment: steps;
    position: relative;
    padding-left: 38px;
    margin-bottom: 22px;
  }
  .instructions > ol > li::before {
    content: counter(steps);
    position: absolute;
    left: 0;
    top: 0;
    background: #e8eef8;
    border-radius: 9px !important;
    width: 26px;
    height: 26px;
    text-align: center;
    line-height: 26px;
    font-weight: 800 !important;
    font-size: 0.75rem !important;
  }
  .instructions > ol > li strong {
    display: block;
    font-size: 0.9rem !important;
    margin-bottom: 4px;
  }
  .instructions > ol > li span {
    font-size: 0.8rem !important;
    line-height: 1.7;
    color: #61708a;
  }
  .note {
    padding: 16px;
    background: #edf2f9;
    border-radius: 12px !important;
    font-size: 0.8rem !important;
    line-height: 1.7;
  }
  .instructions .save-note {
    font-size: 0.7rem !important;
    margin-top: 14px;
  }
  .ranking {
    margin-bottom: 32px;
    padding: 18px;
    background: #edf2f9;
    border-radius: 14px !important;
  }
  .ranking-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .ranking .ranking-heading h2 {
    font-size: 1.15rem !important;
    margin: 0;
  }
  .ranking button,
  .ranking a {
    font-size: 0.75rem !important;
  }
  .ranking button {
    border: 1px solid #91a7ce;
    background: white;
    border-radius: 8px !important;
    padding: 6px 10px;
    color: #31415d;
  }
  .ranking .ranking-list {
    list-style: none;
    padding: 0;
    margin: 12px 0;
  }
  .ranking p {
    font-size: 0.75rem !important;
    margin: 10px 0;
  }
  .save-status {
    color: #ffca73;
    font-size: 0.8rem !important;
    text-align: center;
  }
  .save-status button {
    border: 1px solid #ffca73;
    background: transparent;
    color: inherit;
    border-radius: 8px !important;
    padding: 6px 10px;
    font-size: 0.8rem !important;
  }
  .champion {
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1081;
    max-width: calc(100% - 32px);
    padding: 16px 48px 16px 24px;
    background: #ffca73;
    color: #17243e;
    border-radius: 16px !important;
    box-shadow: 0 8px 32px #07112655 !important;
    text-align: center;
  }
  .champion strong {
    display: block;
    font-size: 1.25rem !important;
    font-weight: 900 !important;
  }
  .champion span {
    font-size: 0.85rem !important;
  }
  .champion button {
    position: absolute;
    top: 8px;
    right: 12px;
    background: transparent;
    border: 0;
    font-size: 1.5rem !important;
  }
  .champion-fireworks {
    position: fixed;
    inset: 0;
    display: flex;
    justify-content: center;
    pointer-events: none;
    overflow: hidden;
    z-index: 1080;
  }
  .drag-shape {
    position: fixed;
    z-index: 1050;
    opacity: 0.85;
    pointer-events: none;
  }
  .drag-shape.touch-drag {
    opacity: 1;
    filter: drop-shadow(0 4px 10px #071126aa);
  }
  @keyframes clear-flash {
    0% {
      background: #fff4bd;
      box-shadow: 0 0 14px #ffca73 !important;
    }
    100% {
      background: #223453;
    }
  }
  @media (max-width: 767px) {
    .blast-layout {
      grid-template-columns: minmax(0, 480px);
      gap: 12px;
    }
    .game-card {
      padding: 18px;
      border-radius: 18px !important;
    }
    .instructions {
      padding: 18px 8px;
    }
    .instructions h2 {
      font-size: 1.5rem !important;
    }
    .piece-slot {
      height: 104px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .cell {
      transition: none;
    }
    .cell.flash {
      animation: none;
    }
  }
</style>

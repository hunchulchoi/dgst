<script lang="ts">
  import { onMount } from 'svelte';
  import type { PageData } from './$types';
  import {
    calculateHardDropScore,
    calculateLineScore,
    canPlace,
    clearLines,
    createEmptyBoard,
    drawNextPiece,
    ensureQueue,
    getGhostPiece,
    getPieceCells,
    getShapeMatrix,
    getStageConfig,
    hardDrop,
    isGameComplete,
    isSpawnBlocked,
    isStageComplete,
    lockPiece,
    movePiece,
    PIECE_COLORS,
    rotateActivePiece,
    spawnPiece,
    STAGES,
    type ActivePiece,
    type Board,
    type PieceType,
    COLS,
    ROWS,
    HIDDEN_ROWS
  } from './gameUtils.js';
  import { playTetrisSound } from './tetrisSounds.js';

  interface TetrisPageProps {
    data: PageData;
  }

  let { data }: TetrisPageProps = $props();

  type Screen = 'menu' | 'playing' | 'paused' | 'stageClear' | 'gameOver' | 'gameWin';

  let screen = $state<Screen>('menu');
  let board = $state<Board>(createEmptyBoard());
  let activePiece = $state<ActivePiece | null>(null);
  let nextQueue = $state<PieceType[]>([]);
  let previewPiece = $state<PieceType>('T');
  let stage = $state(1);
  let stageLines = $state(0);
  let totalLines = $state(0);
  let score = $state(0);
  let holdPiece = $state<PieceType | null>(null);
  let canHold = $state(true);
  let soundEnabled = $state(true);
  let dropInterval = $state<ReturnType<typeof setInterval> | null>(null);
  let stageClearTimeout: ReturnType<typeof setTimeout> | null = null;

  const STORAGE_KEY = 'dgst_tetris_state';
  const SOUND_PREF_KEY = 'dgst_tetris_sound';

  const stageConfig = $derived(getStageConfig(stage));
  const stageProgress = $derived(Math.min(100, (stageLines / stageConfig.linesTarget) * 100));
  const dropMs = $derived(stageConfig.dropIntervalMs);

  /** 렌더용 셀 (고정 블록 + 고스트 + 활성) */
  type RenderCell = { type: PieceType; ghost?: boolean } | null;

  const displayRows = $derived.by(() => {
    const rows: RenderCell[][] = board
      .slice(HIDDEN_ROWS)
      .map((row) => row.map((cell) => (cell ? { type: cell } : null)));

    if (activePiece && screen === 'playing') {
      const ghost = getGhostPiece(board, activePiece);
      for (const { x, y } of getPieceCells(ghost)) {
        const row = y - HIDDEN_ROWS;
        if (row >= 0 && row < ROWS && x >= 0 && x < COLS && rows[row][x] === null) {
          rows[row][x] = { type: ghost.type, ghost: true };
        }
      }
      for (const { x, y } of getPieceCells(activePiece)) {
        const row = y - HIDDEN_ROWS;
        if (row >= 0 && row < ROWS && x >= 0 && x < COLS) {
          rows[row][x] = { type: activePiece.type };
        }
      }
    }
    return rows;
  });

  function spawnFromQueue(resetHold = true): boolean {
    const drawn = drawNextPiece(nextQueue);
    nextQueue = drawn.queue;
    previewPiece = ensureQueue(nextQueue)[0] ?? 'T';
    const piece = spawnPiece(drawn.piece);
    if (resetHold) canHold = true;
    if (isSpawnBlocked(board, piece)) {
      activePiece = piece;
      return false;
    }
    activePiece = piece;
    return true;
  }

  function startGame() {
    if (stageClearTimeout) clearTimeout(stageClearTimeout);
    board = createEmptyBoard();
    nextQueue = ensureQueue([]);
    previewPiece = nextQueue[0] ?? 'T';
    stage = 1;
    stageLines = 0;
    totalLines = 0;
    score = 0;
    holdPiece = null;
    canHold = true;
    activePiece = null;
    screen = 'playing';
    if (!spawnFromQueue()) {
      screen = 'gameOver';
    }
    startDropTimer();
  }

  function startDropTimer() {
    stopDropTimer();
    dropInterval = setInterval(() => {
      softDrop();
    }, dropMs);
  }

  function stopDropTimer() {
    if (dropInterval) {
      clearInterval(dropInterval);
      dropInterval = null;
    }
  }

  function pauseGame() {
    if (screen !== 'playing') return;
    screen = 'paused';
    stopDropTimer();
  }

  function resumeGame() {
    if (screen !== 'paused') return;
    screen = 'playing';
    startDropTimer();
  }

  function togglePause() {
    if (screen === 'playing') pauseGame();
    else if (screen === 'paused') resumeGame();
  }

  /** 피스 고정 후 줄 처리 */
  function settlePiece(lockedBoard: Board, hardDropDistance = 0) {
    const { board: clearedBoard, linesCleared } = clearLines(lockedBoard);
    board = clearedBoard;
    if (linesCleared > 0) {
      score += calculateLineScore(linesCleared, stage);
      stageLines += linesCleared;
      totalLines += linesCleared;
      playTetrisSound('clear', soundEnabled);
    }
    if (hardDropDistance > 0) {
      score += calculateHardDropScore(hardDropDistance);
    }

    if (isStageComplete(stageLines, stage)) {
      handleStageClear();
      return;
    }

    if (!spawnFromQueue()) {
      stopDropTimer();
      screen = 'gameOver';
      playTetrisSound('over', soundEnabled);
    }
  }

  function handleStageClear() {
    stopDropTimer();
    playTetrisSound('stage', soundEnabled);
    screen = 'stageClear';
    if (stageClearTimeout) clearTimeout(stageClearTimeout);
    stageClearTimeout = setTimeout(() => {
      if (screen === 'stageClear') advanceStage();
    }, 2500);
  }

  function advanceStage() {
    if (stageClearTimeout) {
      clearTimeout(stageClearTimeout);
      stageClearTimeout = null;
    }
    const nextStage = stage + 1;
    if (isGameComplete(nextStage)) {
      screen = 'gameWin';
      activePiece = null;
      playTetrisSound('win', soundEnabled);
      return;
    }
    stage = nextStage;
    stageLines = 0;
    board = createEmptyBoard();
    holdPiece = null;
    canHold = true;
    activePiece = null;
    screen = 'playing';
    if (!spawnFromQueue()) {
      screen = 'gameOver';
      return;
    }
    startDropTimer();
  }

  function softDrop() {
    if (!activePiece || screen !== 'playing') return;
    const moved = movePiece(activePiece, 0, 1);
    if (canPlace(board, moved)) {
      activePiece = moved;
      return;
    }
    playTetrisSound('drop', soundEnabled);
    const locked = lockPiece(board, activePiece);
    activePiece = null;
    settlePiece(locked);
  }

  function moveHorizontal(dx: number) {
    if (!activePiece || screen !== 'playing') return;
    const moved = movePiece(activePiece, dx, 0);
    if (canPlace(board, moved)) {
      activePiece = moved;
      playTetrisSound('move', soundEnabled);
    }
  }

  function rotatePieceAction() {
    if (!activePiece || screen !== 'playing') return;
    const rotated = rotateActivePiece(board, activePiece);
    if (rotated) {
      activePiece = rotated;
      playTetrisSound('rotate', soundEnabled);
    }
  }

  function holdPieceAction() {
    if (!activePiece || !canHold || screen !== 'playing') return;
    canHold = false;
    const currentType = activePiece.type;
    if (holdPiece === null) {
      holdPiece = currentType;
      if (!spawnFromQueue(false)) {
        stopDropTimer();
        screen = 'gameOver';
        playTetrisSound('over', soundEnabled);
      }
      canHold = false;
      return;
    }
    const swapType = holdPiece;
    holdPiece = currentType;
    const swapped = spawnPiece(swapType);
    if (isSpawnBlocked(board, swapped)) {
      holdPiece = swapType;
      activePiece = spawnPiece(currentType);
      canHold = true;
      return;
    }
    activePiece = swapped;
    playTetrisSound('rotate', soundEnabled);
  }

  function dropHard() {
    if (!activePiece || screen !== 'playing') return;
    const result = hardDrop(board, activePiece);
    activePiece = result.piece;
    playTetrisSound('drop', soundEnabled);
    const locked = lockPiece(board, activePiece);
    activePiece = null;
    settlePiece(locked, result.distance);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (screen === 'menu' || screen === 'gameOver' || screen === 'gameWin') {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        startGame();
      }
      return;
    }
    if (screen === 'stageClear') {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        advanceStage();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        e.preventDefault();
        moveHorizontal(-1);
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        e.preventDefault();
        moveHorizontal(1);
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        e.preventDefault();
        softDrop();
        break;
      case 'ArrowUp':
      case 'w':
      case 'W':
      case 'x':
      case 'X':
        e.preventDefault();
        rotatePieceAction();
        break;
      case ' ':
        e.preventDefault();
        dropHard();
        break;
      case 'c':
      case 'C':
      case 'Shift':
        e.preventDefault();
        holdPieceAction();
        break;
      case 'p':
      case 'P':
      case 'Escape':
        e.preventDefault();
        togglePause();
        break;
    }
  }

  /** 미리보기 미니 그리드 셀 */
  function previewCells(type: PieceType): boolean[][] {
    const matrix = getShapeMatrix(type, 0);
    return matrix.map((row) => row.map((v) => v === 1));
  }

  type SavedState = {
    screen: Screen;
    board: Board;
    activePiece: ActivePiece | null;
    nextQueue: PieceType[];
    previewPiece: PieceType;
    stage: number;
    stageLines: number;
    totalLines: number;
    score: number;
    holdPiece: PieceType | null;
    canHold: boolean;
  };

  function saveState() {
    if (screen === 'menu') return;
    try {
      const state: SavedState = {
        screen,
        board,
        activePiece,
        nextQueue,
        previewPiece,
        stage,
        stageLines,
        totalLines,
        score,
        holdPiece,
        canHold
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('[tetris localStorage save failed]', err);
    }
  }

  function loadState(): SavedState | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SavedState;
      if (!parsed || typeof parsed !== 'object') return null;
      if (!['playing', 'paused', 'stageClear'].includes(parsed.screen)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function restoreState(saved: SavedState) {
    screen = saved.screen === 'stageClear' ? 'playing' : saved.screen;
    board = saved.board;
    activePiece = saved.activePiece;
    nextQueue = saved.nextQueue;
    previewPiece = saved.previewPiece;
    stage = saved.stage;
    stageLines = saved.stageLines;
    totalLines = saved.totalLines;
    score = saved.score;
    holdPiece = saved.holdPiece ?? null;
    canHold = saved.canHold ?? true;
    if (screen === 'playing') startDropTimer();
  }

  function toggleSound() {
    soundEnabled = !soundEnabled;
    try {
      localStorage.setItem(SOUND_PREF_KEY, soundEnabled ? '1' : '0');
    } catch (err) {
      console.error('[tetris sound pref save failed]', err);
    }
    if (soundEnabled) playTetrisSound('move', true);
  }

  /** 모바일 버튼 연타 방지 */
  let touchLock = $state(false);
  function withTouchLock(fn: () => void) {
    if (touchLock || screen !== 'playing') return;
    touchLock = true;
    fn();
    setTimeout(() => {
      touchLock = false;
    }, 80);
  }

  onMount(() => {
    try {
      soundEnabled = localStorage.getItem(SOUND_PREF_KEY) !== '0';
    } catch {
      soundEnabled = true;
    }

    const saved = loadState();
    if (saved) restoreState(saved);

    window.addEventListener('keydown', handleKeydown);
    return () => {
      window.removeEventListener('keydown', handleKeydown);
      stopDropTimer();
      if (stageClearTimeout) clearTimeout(stageClearTimeout);
      saveState();
    };
  });

  $effect(() => {
    if (screen === 'playing' || screen === 'paused') {
      saveState();
    }
  });

  $effect(() => {
    if (screen === 'playing') {
      dropMs;
      startDropTimer();
    }
  });
</script>

<svelte:head>
  <title>테트리스 | dgst.me</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
</svelte:head>

<div class="tetris-page container py-3 py-md-4">
  <div class="row justify-content-center g-3">
    <div class="col-12 col-lg-7 col-xl-6">
      <div class="card shadow rounded-4 tetris-card">
        <div class="card-body p-3 p-md-4">
          {#if screen === 'menu'}
            <div class="text-center py-3">
              <h2 class="mb-2">🧱 테트리스</h2>
              <p class="text-muted mb-4">
                10단계 스테이지를 클리어하세요!<br />
                각 스테이지마다 목표 줄 수를 채우면 다음 단계로 넘어갑니다.
              </p>
              <div class="d-flex flex-column align-items-center gap-2">
                <button type="button" class="btn btn-lg btn-primary px-5" onclick={startGame}>
                  시작
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-outline-secondary"
                  onclick={toggleSound}
                  aria-pressed={soundEnabled}
                >
                  {soundEnabled ? '🔊 사운드 켜짐' : '🔇 사운드 꺼짐'}
                </button>
              </div>
              <div class="mt-4 text-start stage-list">
                <p class="small fw-semibold mb-2">스테이지 목표</p>
                <ul class="small text-muted mb-0">
                  {#each STAGES as s (s.stage)}
                    <li>Stage {s.stage} ({s.label}): {s.linesTarget}줄 · 낙하 {s.dropIntervalMs}ms</li>
                  {/each}
                </ul>
              </div>
            </div>
          {:else}
            <div class="d-flex justify-content-between align-items-start mb-2 flex-wrap gap-2">
              <div>
                <h4 class="mb-0">
                  Stage {stage}
                  <span class="badge bg-secondary ms-1">{stageConfig.label}</span>
                </h4>
                <p class="small text-muted mb-0">
                  목표 {stageLines}/{stageConfig.linesTarget}줄 · 총 {totalLines}줄
                </p>
              </div>
              <div class="d-flex gap-2">
                <button
                  type="button"
                  class="btn btn-sm btn-outline-secondary"
                  onclick={toggleSound}
                  aria-label={soundEnabled ? '사운드 끄기' : '사운드 켜기'}
                >
                  {soundEnabled ? '🔊' : '🔇'}
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-outline-secondary"
                  onclick={togglePause}
                  disabled={screen === 'stageClear' || screen === 'gameOver' || screen === 'gameWin'}
                >
                  {screen === 'paused' ? '▶' : '⏸'}
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-outline-dark"
                  onclick={() => {
                    stopDropTimer();
                    screen = 'menu';
                  }}
                >
                  메뉴
                </button>
              </div>
            </div>

            <div class="progress mb-3" style="height: 8px;" role="progressbar" aria-valuenow={stageProgress}>
              <div class="progress-bar bg-success" style="width: {stageProgress}%"></div>
            </div>

            <div class="tetris-layout">
              <div class="tetris-board-wrap">
                <div class="tetris-board" aria-label="테트리스 보드">
                  {#each displayRows as row, rowIdx (rowIdx)}
                    <div class="tetris-row">
                      {#each row as cell, colIdx (`${rowIdx}-${colIdx}`)}
                        <div
                          class="tetris-cell"
                          class:tetris-cell-filled={cell !== null}
                          class:tetris-cell-ghost={cell?.ghost}
                          style={cell ? `--cell-color: ${PIECE_COLORS[cell.type]}` : ''}
                        ></div>
                      {/each}
                    </div>
                  {/each}

                  {#if screen === 'paused'}
                    <div class="tetris-overlay">
                      <p class="tetris-overlay-title">일시정지</p>
                      <button type="button" class="btn btn-light btn-sm" onclick={resumeGame}>계속</button>
                    </div>
                  {/if}
                  {#if screen === 'stageClear'}
                    <div class="tetris-overlay tetris-overlay-clear">
                      <p class="tetris-overlay-title">Stage {stage} 클리어!</p>
                      <p class="small mb-2">점수 {score.toLocaleString()}</p>
                      <button type="button" class="btn btn-success btn-sm" onclick={advanceStage}>
                        {stage >= STAGES.length ? '결과 보기' : '다음 스테이지'}
                      </button>
                    </div>
                  {/if}
                  {#if screen === 'gameOver'}
                    <div class="tetris-overlay tetris-overlay-over">
                      <p class="tetris-overlay-title">게임 오버</p>
                      <p class="small mb-2">Stage {stage} · {score.toLocaleString()}점</p>
                      <button type="button" class="btn btn-primary btn-sm" onclick={startGame}>다시 하기</button>
                    </div>
                  {/if}
                  {#if screen === 'gameWin'}
                    <div class="tetris-overlay tetris-overlay-win">
                      <p class="tetris-overlay-title">🎉 전체 클리어!</p>
                      <p class="small mb-2">{score.toLocaleString()}점 · {totalLines}줄</p>
                      <button type="button" class="btn btn-warning btn-sm" onclick={startGame}>다시 도전</button>
                    </div>
                  {/if}
                </div>
              </div>

              <aside class="tetris-side" aria-label="게임 정보">
                <div class="tetris-panel">
                  <p class="tetris-panel-label">점수</p>
                  <p class="tetris-panel-value">{score.toLocaleString()}</p>
                </div>
                <div class="tetris-panel">
                  <p class="tetris-panel-label">홀드</p>
                  <div class="tetris-preview" aria-hidden="true">
                    {#if holdPiece}
                      {#each previewCells(holdPiece) as row, r (r)}
                        <div class="tetris-preview-row">
                          {#each row as filled, c (`hold-${r}-${c}`)}
                            <div
                              class="tetris-preview-cell"
                              class:tetris-preview-filled={filled}
                              style={filled ? `--cell-color: ${PIECE_COLORS[holdPiece]}` : ''}
                            ></div>
                          {/each}
                        </div>
                      {/each}
                    {:else}
                      <div class="tetris-hold-empty">—</div>
                    {/if}
                  </div>
                </div>
                <div class="tetris-panel">
                  <p class="tetris-panel-label">다음</p>
                  <div class="tetris-preview" aria-hidden="true">
                    {#each previewCells(previewPiece) as row, r (r)}
                      <div class="tetris-preview-row">
                        {#each row as filled, c (`${r}-${c}`)}
                          <div
                            class="tetris-preview-cell"
                            class:tetris-preview-filled={filled}
                            style={filled ? `--cell-color: ${PIECE_COLORS[previewPiece]}` : ''}
                          ></div>
                        {/each}
                      </div>
                    {/each}
                  </div>
                </div>
                <div class="tetris-panel d-none d-md-block">
                  <p class="tetris-panel-label small text-muted mb-1">조작</p>
                  <ul class="small text-muted mb-0 ps-3">
                    <li>← → 이동</li>
                    <li>↑ 회전</li>
                    <li>↓ 소프트 드롭</li>
                    <li>Space 하드 드롭</li>
                    <li>C / Shift 홀드</li>
                    <li>P 일시정지</li>
                  </ul>
                </div>
              </aside>
            </div>

            <div class="tetris-controls mt-3" aria-label="터치 조작">
              <div class="tetris-controls-row">
                <button
                  type="button"
                  class="tetris-btn tetris-btn-hold"
                  class:tetris-btn-disabled={!canHold}
                  aria-label="홀드"
                  disabled={!canHold}
                  onclick={() => withTouchLock(holdPieceAction)}
                >
                  H
                </button>
              </div>
              <div class="tetris-controls-row">
                <button
                  type="button"
                  class="tetris-btn"
                  aria-label="왼쪽"
                  onclick={() => withTouchLock(() => moveHorizontal(-1))}
                >
                  ◀
                </button>
                <button
                  type="button"
                  class="tetris-btn tetris-btn-rotate"
                  aria-label="회전"
                  onclick={() => withTouchLock(rotatePieceAction)}
                >
                  ↻
                </button>
                <button
                  type="button"
                  class="tetris-btn"
                  aria-label="오른쪽"
                  onclick={() => withTouchLock(() => moveHorizontal(1))}
                >
                  ▶
                </button>
              </div>
              <div class="tetris-controls-row">
                <button
                  type="button"
                  class="tetris-btn tetris-btn-wide"
                  aria-label="아래"
                  onclick={() => withTouchLock(softDrop)}
                >
                  ▼
                </button>
                <button
                  type="button"
                  class="tetris-btn tetris-btn-drop"
                  aria-label="하드 드롭"
                  onclick={() => withTouchLock(dropHard)}
                >
                  ⬇
                </button>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .tetris-page {
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
  }

  .tetris-card {
    overflow: hidden;
  }

  .stage-list {
    max-height: 180px;
    overflow-y: auto;
  }

  .tetris-layout {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    justify-content: center;
  }

  .tetris-board-wrap {
    flex: 1 1 auto;
    max-width: min(100%, 320px);
  }

  .tetris-board {
    position: relative;
    background: #111827;
    border: 3px solid #374151;
    border-radius: 8px;
    padding: 4px;
    aspect-ratio: 10 / 20;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .tetris-row {
    display: flex;
    gap: 2px;
    flex: 1;
  }

  .tetris-cell {
    flex: 1;
    background: #1f2937;
    border-radius: 2px;
  }

  .tetris-cell-filled {
    background: var(--cell-color);
    box-shadow: inset 2px 2px 0 rgba(255, 255, 255, 0.35), inset -2px -2px 0 rgba(0, 0, 0, 0.25);
  }

  .tetris-cell-ghost {
    opacity: 0.35;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.5);
  }

  .tetris-overlay {
    position: absolute;
    inset: 0;
    background: rgba(17, 24, 39, 0.82);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    z-index: 5;
  }

  .tetris-overlay-title {
    font-size: clamp(1.25rem, 5vw, 1.75rem);
    font-weight: 700;
    color: #fff;
    margin-bottom: 0.5rem;
    text-align: center;
  }

  .tetris-overlay-clear {
    background: rgba(22, 101, 52, 0.88);
  }

  .tetris-overlay-over {
    background: rgba(127, 29, 29, 0.88);
  }

  .tetris-overlay-win {
    background: rgba(120, 53, 15, 0.9);
  }

  .tetris-side {
    flex: 0 0 100px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .tetris-panel {
    background: #f3f4f6;
    border-radius: 8px;
    padding: 8px 10px;
  }

  .tetris-panel-label {
    font-size: 0.75rem;
    color: #6b7280;
    margin-bottom: 2px;
  }

  .tetris-panel-value {
    font-size: 1.1rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    margin: 0;
  }

  .tetris-preview {
    display: grid;
    grid-template-rows: repeat(4, 14px);
    gap: 2px;
  }

  .tetris-preview-row {
    display: grid;
    grid-template-columns: repeat(4, 14px);
    gap: 2px;
  }

  .tetris-preview-cell {
    background: #e5e7eb;
    border-radius: 2px;
  }

  .tetris-preview-filled {
    background: var(--cell-color);
  }

  .tetris-hold-empty {
    height: 62px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #9ca3af;
    font-size: 1.25rem;
  }

  .tetris-controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 320px;
    margin-inline: auto;
  }

  .tetris-controls-row {
    display: flex;
    gap: 8px;
    justify-content: center;
  }

  .tetris-btn {
    flex: 1;
    min-height: 52px;
    max-width: 96px;
    border: none;
    border-radius: 12px;
    background: #374151;
    color: #fff;
    font-size: 1.35rem;
    font-weight: 700;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition: transform 0.08s ease, background 0.08s ease;
  }

  .tetris-btn:active {
    transform: scale(0.95);
    background: #1f2937;
  }

  .tetris-btn-rotate {
    background: #4b5563;
  }

  .tetris-btn-wide {
    max-width: 140px;
  }

  .tetris-btn-drop {
    max-width: 140px;
    background: #b45309;
  }

  .tetris-btn-drop:active {
    background: #92400e;
  }

  .tetris-btn-hold {
    max-width: 100%;
    background: #6366f1;
  }

  .tetris-btn-hold:active {
    background: #4f46e5;
  }

  .tetris-btn-disabled,
  .tetris-btn:disabled {
    opacity: 0.45;
    pointer-events: none;
  }

  @media (max-width: 575.98px) {
    .tetris-side {
      flex: 0 0 84px;
    }

    .tetris-preview {
      grid-template-rows: repeat(4, 12px);
    }

    .tetris-preview-row {
      grid-template-columns: repeat(4, 12px);
    }

    .tetris-btn {
      min-height: 56px;
    }
  }
</style>

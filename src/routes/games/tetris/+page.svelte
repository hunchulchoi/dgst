<script lang="ts">
  import { resolve } from '$app/paths';
  import { beforeNavigate } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import { ko } from 'date-fns/locale';
  import { formatRelativeTime } from '$lib/util/formatRelativeTime.js';
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
    HIDDEN_ROWS,
    TOTAL_ROWS
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
  let rankList = $state<
    Array<{ nickname: string; score: number; stage?: number; createdAt?: string; _id?: string }>
  >([]);
  let myBestScore = $state<number | null>(null);
  let myBestStage = $state<number | null>(null);
  let myBestCreatedAt = $state<string | null>(null);
  let todayStats = $state<{ games: number; users: number }>({ games: 0, users: 0 });
  let rankLoading = $state(false);
  let canResume = $state(false);
  let resumeSummary = $state<{ stage: number; score: number; label: string } | null>(null);

  const STORAGE_KEY = 'dgst_tetris_state';
  const SOUND_PREF_KEY = 'dgst_tetris_sound';
  const SAVE_VERSION = 1;
  const PIECE_TYPES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  const RESUMABLE_SCREENS: Screen[] = ['playing', 'paused', 'stageClear'];
  const isLoggedIn = $derived(!!data.session?.user?.email);

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
    clearSave();
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
      endGameOver();
      return;
    }
    startDropTimer();
    if (isLoggedIn) void logGameStart();
    void focusBoard();
  }

  /** 게임오버 공통 처리 */
  function endGameOver() {
    stopDropTimer();
    screen = 'gameOver';
    clearSave();
    playTetrisSound('over', soundEnabled);
    if (isLoggedIn) void submitGameScore(score, stage);
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
    void focusBoard();
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
      endGameOver();
    }
  }

  function scheduleStageClearAdvance() {
    if (stageClearTimeout) clearTimeout(stageClearTimeout);
    stageClearTimeout = setTimeout(() => {
      if (screen === 'stageClear') advanceStage();
    }, 2500);
  }

  function handleStageClear() {
    stopDropTimer();
    playTetrisSound('stage', soundEnabled);
    screen = 'stageClear';
    scheduleStageClearAdvance();
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
      clearSave();
      playTetrisSound('win', soundEnabled);
      if (isLoggedIn) void submitGameScore(score, STAGES.length);
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
      endGameOver();
      return;
    }
    startDropTimer();
  }

  async function loadRank() {
    rankLoading = true;
    try {
      const res = await fetch(`/games/tetris?rank=1&_=${Date.now()}`, { cache: 'no-store' });
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
      await fetch('/games/tetris', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' })
      });
    } catch (err) {
      console.error('[tetris start log failed]', err);
    }
  }

  async function submitGameScore(finalScore: number, finalStage: number) {
    if (!isLoggedIn || finalScore <= 0) return;
    try {
      const res = await fetch('/games/tetris', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: finalScore, stage: finalStage })
      });
      if (res.ok) await loadRank();
    } catch (err) {
      console.error('[tetris score submit failed]', err);
    }
  }

  function formatScore(n: number): string {
    return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n);
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
    if (!activePiece) return;
    const moved = movePiece(activePiece, dx, 0);
    if (canPlace(board, moved)) {
      activePiece = moved;
      playTetrisSound('move', soundEnabled);
    }
  }

  function rotatePieceAction() {
    if (!activePiece) return;
    const rotated = rotateActivePiece(board, activePiece);
    if (rotated) {
      activePiece = rotated;
      playTetrisSound('rotate', soundEnabled);
    }
  }

  function holdPieceAction() {
    if (!activePiece || !canHold) return;
    canHold = false;
    const currentType = activePiece.type;
    if (holdPiece === null) {
      holdPiece = currentType;
      if (!spawnFromQueue(false)) {
        endGameOver();
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
    if (!activePiece) return;
    const result = hardDrop(board, activePiece);
    activePiece = result.piece;
    playTetrisSound('drop', soundEnabled);
    const locked = lockPiece(board, activePiece);
    activePiece = null;
    settlePiece(locked, result.distance);
  }

  /** 모바일 버튼 연타 방지 */
  let touchLock = $state(false);
  let boardWrapEl = $state<HTMLDivElement | null>(null);

  async function focusBoard() {
    await tick();
    boardWrapEl?.focus({ preventScroll: true });
  }

  /** 일시정지 중이면 재개 후 게임 입력 처리 */
  function runGameAction(action: () => void) {
    if (screen !== 'playing' && screen !== 'paused') return;
    if (screen === 'paused') {
      screen = 'playing';
      startDropTimer();
    }
    action();
  }

  function handleKeydown(e: KeyboardEvent) {
    const target = e.target;
    if (
      target instanceof HTMLElement &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
    ) {
      return;
    }

    if (screen === 'menu' || screen === 'gameOver' || screen === 'gameWin') {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (screen === 'menu' && canResume) resumeSavedGame();
        else startNewGame();
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
        runGameAction(() => moveHorizontal(-1));
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        e.preventDefault();
        runGameAction(() => moveHorizontal(1));
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        e.preventDefault();
        runGameAction(softDrop);
        break;
      case 'ArrowUp':
      case 'w':
      case 'W':
      case 'x':
      case 'X':
        e.preventDefault();
        runGameAction(rotatePieceAction);
        break;
      case ' ':
        e.preventDefault();
        runGameAction(dropHard);
        break;
      case 'c':
      case 'C':
        e.preventDefault();
        runGameAction(holdPieceAction);
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
    version: number;
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
    savedAt: string;
  };

  /** 저장 가능한 스냅샷 생성 */
  function getStateToSave(): SavedState | null {
    if (!RESUMABLE_SCREENS.includes(screen)) return null;
    return {
      version: SAVE_VERSION,
      screen,
      board: board.map((row) => [...row]),
      activePiece: activePiece ? { ...activePiece } : null,
      nextQueue: [...nextQueue],
      previewPiece,
      stage,
      stageLines,
      totalLines,
      score,
      holdPiece,
      canHold,
      savedAt: new Date().toISOString()
    };
  }

  function persistState(state: SavedState) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      refreshResumeInfo();
    } catch (err) {
      console.error('[tetris localStorage save failed]', err);
    }
  }

  function saveState() {
    const state = getStateToSave();
    if (state) persistState(state);
  }

  function clearSave() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.error('[tetris localStorage clear failed]', err);
    }
    refreshResumeInfo();
  }

  function isValidPieceType(value: unknown): value is PieceType {
    return typeof value === 'string' && PIECE_TYPES.includes(value as PieceType);
  }

  function isValidActivePiece(value: unknown): value is ActivePiece {
    if (!value || typeof value !== 'object') return false;
    const piece = value as ActivePiece;
    return (
      isValidPieceType(piece.type) &&
      Number.isInteger(piece.rotation) &&
      piece.rotation >= 0 &&
      piece.rotation < 4 &&
      Number.isInteger(piece.x) &&
      Number.isInteger(piece.y)
    );
  }

  /** localStorage 저장값 검증 */
  function parseSavedState(raw: string): SavedState | null {
    try {
      const parsed = JSON.parse(raw) as Partial<SavedState>;
      if (!parsed || typeof parsed !== 'object') return null;
      if (!RESUMABLE_SCREENS.includes(parsed.screen as Screen)) return null;
      if (!Array.isArray(parsed.board) || parsed.board.length !== TOTAL_ROWS) return null;
      if (!parsed.board.every((row) => Array.isArray(row) && row.length === COLS)) return null;
      if (
        !parsed.board.every((row) =>
          row.every((cell) => cell === null || isValidPieceType(cell))
        )
      ) {
        return null;
      }
      if (parsed.activePiece != null && !isValidActivePiece(parsed.activePiece)) return null;
      if (!Array.isArray(parsed.nextQueue) || parsed.nextQueue.some((p) => !isValidPieceType(p))) {
        return null;
      }
      if (!isValidPieceType(parsed.previewPiece)) return null;
      if (parsed.holdPiece != null && !isValidPieceType(parsed.holdPiece)) return null;
      const stageNum = Number(parsed.stage);
      if (!Number.isInteger(stageNum) || stageNum < 1 || stageNum > STAGES.length) return null;
      return parsed as SavedState;
    } catch {
      return null;
    }
  }

  function loadState(): SavedState | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return parseSavedState(raw);
    } catch {
      return null;
    }
  }

  function refreshResumeInfo() {
    const saved = loadState();
    if (!saved) {
      canResume = false;
      resumeSummary = null;
      return;
    }
    canResume = true;
    resumeSummary = {
      stage: saved.stage,
      score: saved.score,
      label: getStageConfig(saved.stage).label
    };
  }

  function restoreState(saved: SavedState) {
    board = saved.board.map((row) => [...row]);
    activePiece = saved.activePiece ? { ...saved.activePiece } : null;
    nextQueue = [...saved.nextQueue];
    previewPiece = saved.previewPiece;
    stage = saved.stage;
    stageLines = saved.stageLines;
    totalLines = saved.totalLines;
    score = saved.score;
    holdPiece = saved.holdPiece ?? null;
    canHold = saved.canHold ?? true;
    screen = saved.screen;

    stopDropTimer();
    if (stageClearTimeout) {
      clearTimeout(stageClearTimeout);
      stageClearTimeout = null;
    }

    if (screen === 'playing') {
      screen = 'paused';
    } else if (screen === 'stageClear') {
      scheduleStageClearAdvance();
    }
  }

  /** 저장된 게임 이어하기 */
  function resumeSavedGame() {
    const saved = loadState();
    if (!saved) return;
    restoreState(saved);
    void focusBoard();
  }

  /** 새 게임 (저장 있으면 확인) */
  function startNewGame() {
    if (canResume && !confirm('저장된 게임이 있습니다. 새로 시작하시겠습니까?')) return;
    startGame();
  }

  /** 메뉴 이동 전 autosave */
  function goToMenu() {
    stopDropTimer();
    if (stageClearTimeout) {
      clearTimeout(stageClearTimeout);
      stageClearTimeout = null;
    }
    if (screen === 'playing') screen = 'paused';
    saveState();
    screen = 'menu';
    refreshResumeInfo();
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
  function withTouchLock(fn: () => void) {
    if (touchLock) return;
    if (screen !== 'playing' && screen !== 'paused') return;
    touchLock = true;
    runGameAction(fn);
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

    refreshResumeInfo();
    const saved = loadState();
    if (saved) {
      restoreState(saved);
      void focusBoard();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveState();
    };
    const handleBeforeUnload = () => saveState();

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      stopDropTimer();
      if (stageClearTimeout) clearTimeout(stageClearTimeout);
      saveState();
    };
  });

  beforeNavigate(() => {
    saveState();
  });

  $effect(() => {
    if (isLoggedIn) loadRank();
  });

  $effect(() => {
    if (RESUMABLE_SCREENS.includes(screen)) {
      saveState();
    }
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
  <title>테트리스 | dgst.me</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
</svelte:head>

<div class="tetris-page container py-3 py-md-4">
  <div class="row justify-content-center g-3">
    <div class="col-12 col-md-8 col-lg-7 col-xl-6">
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
                {#if canResume && resumeSummary}
                  <div class="alert alert-light border w-100 mb-0 py-2 px-3 text-start">
                    <p class="small fw-semibold mb-1">저장된 게임</p>
                    <p class="small text-muted mb-0">
                      Stage {resumeSummary.stage} ({resumeSummary.label}) · {resumeSummary.score.toLocaleString()}점
                    </p>
                  </div>
                  <button type="button" class="btn btn-lg btn-primary px-5" onclick={resumeSavedGame}>
                    이어하기
                  </button>
                  <button type="button" class="btn btn-lg btn-outline-primary px-5" onclick={startNewGame}>
                    새 게임
                  </button>
                {:else}
                  <button type="button" class="btn btn-lg btn-primary px-5" onclick={startNewGame}>
                    시작
                  </button>
                {/if}
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
                  onclick={goToMenu}
                >
                  메뉴
                </button>
              </div>
            </div>

            <div class="progress mb-3" style="height: 8px;" role="progressbar" aria-valuenow={stageProgress}>
              <div class="progress-bar bg-success" style="width: {stageProgress}%"></div>
            </div>

            <div class="tetris-layout">
              <div
                class="tetris-board-wrap"
                bind:this={boardWrapEl}
                role="application"
                aria-label="테트리스 조작 영역"
                tabindex="-1"
              >
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
                      <p class="small text-white-50 mb-2">방향키 또는 ▶로 계속</p>
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
                      <p class="small mb-2">
                        Stage {stage} · {score.toLocaleString()}점
                        {#if isLoggedIn}<span class="d-block text-white-50">랭킹에 반영됨</span>{/if}
                      </p>
                      <button type="button" class="btn btn-primary btn-sm" onclick={startNewGame}>다시 하기</button>
                    </div>
                  {/if}
                  {#if screen === 'gameWin'}
                    <div class="tetris-overlay tetris-overlay-win">
                      <p class="tetris-overlay-title">🎉 전체 클리어!</p>
                      <p class="small mb-2">
                        {score.toLocaleString()}점 · {totalLines}줄
                        {#if isLoggedIn}<span class="d-block text-white-50">랭킹에 반영됨</span>{/if}
                      </p>
                      <button type="button" class="btn btn-warning btn-sm" onclick={startNewGame}>다시 도전</button>
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
                    <li>C 홀드</li>
                    <li>P 일시정지</li>
                  </ul>
                </div>
              </aside>
            </div>

            <div class="tetris-controls mt-3" aria-label="터치 조작">
              <div class="tetris-controls-split">
                <div class="tetris-controls-left">
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
                      class="tetris-btn"
                      aria-label="아래"
                      onclick={() => withTouchLock(softDrop)}
                    >
                      ▼
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
                      class="tetris-btn tetris-btn-hold"
                      class:tetris-btn-disabled={!canHold}
                      aria-label="홀드"
                      disabled={!canHold}
                      onclick={() => withTouchLock(holdPieceAction)}
                    >
                      H
                    </button>
                    <button
                      type="button"
                      class="tetris-btn tetris-btn-drop tetris-btn-wide"
                      aria-label="하드 드롭"
                      onclick={() => withTouchLock(dropHard)}
                    >
                      ⬇
                    </button>
                  </div>
                </div>
                <div class="tetris-controls-right">
                  <button
                    type="button"
                    class="tetris-btn tetris-btn-rotate tetris-btn-rotate-main"
                    aria-label="회전"
                    onclick={() => withTouchLock(rotatePieceAction)}
                  >
                    ↻
                  </button>
                </div>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
    <div class="col-12 col-md-4 col-lg-3">
      <div class="card shadow rounded-4">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="mb-0">랭킹 Top 10</h5>
            {#if isLoggedIn}
              <button
                class="btn btn-sm btn-outline-secondary"
                onclick={loadRank}
                disabled={rankLoading}
                aria-label="랭킹 새로고침"
              >
                🔄
              </button>
            {:else}
              <a href={resolve('/login')} class="btn btn-sm btn-outline-primary">로그인</a>
            {/if}
          </div>
          <p class="small text-muted mb-1">전체 기간 1인 1최고점</p>
          <p class="small text-muted mb-2">
            오늘 참여 <strong>{todayStats.users}</strong>명 · 게임 <strong>{todayStats.games}</strong>회
          </p>
          {#if isLoggedIn}
            <p class="small mb-2">
              내 최고: {myBestScore != null ? formatScore(myBestScore) : '—'}
              {#if myBestStage != null && myBestStage > 0}
                <span class="text-muted">· Stage {myBestStage}</span>
              {/if}
              {#if myBestCreatedAt}
                <span class="text-muted d-block">
                  {formatRelativeTime(myBestCreatedAt, { locale: ko, addSuffix: true })}
                </span>
              {/if}
            </p>
            <ol class="list-group list-group-numbered">
              {#each rankList as r (r._id ?? `${r.nickname}:${r.score}`)}
                <li class="list-group-item d-flex justify-content-between align-items-center">
                  <span>{r.nickname}</span>
                  <span class="text-end">
                    <span class="fw-bold font-monospace">{formatScore(r.score)}</span>
                    {#if r.stage != null && r.stage > 0}
                      <span class="small text-muted"> · S{r.stage}</span>
                    {/if}
                    {#if r.createdAt}
                      <span class="small text-muted d-block">
                        {formatRelativeTime(r.createdAt, { locale: ko, addSuffix: true })}
                      </span>
                    {/if}
                  </span>
                </li>
              {/each}
            </ol>
          {:else}
            <p class="small text-muted">로그인하면 랭킹을 볼 수 있어요.</p>
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
    outline: none;
  }

  .tetris-board-wrap:focus-visible {
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.45);
    border-radius: 10px;
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
    width: 100%;
    max-width: 360px;
    margin-inline: auto;
  }

  .tetris-controls-split {
    display: flex;
    gap: 10px;
    align-items: stretch;
    width: 100%;
  }

  .tetris-controls-left {
    flex: 1.35;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  .tetris-controls-right {
    flex: 0.85;
    display: flex;
    min-width: 0;
  }

  .tetris-controls-row {
    display: flex;
    gap: 8px;
    justify-content: center;
  }

  .tetris-controls-left .tetris-controls-row {
    justify-content: stretch;
  }

  .tetris-controls-left .tetris-btn {
    flex: 1;
    max-width: none;
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

  .tetris-btn-rotate-main {
    flex: 1;
    width: 100%;
    min-height: 116px;
    max-width: none;
    font-size: 2rem;
  }

  .tetris-btn-wide {
    flex: 1.6;
    max-width: none;
  }

  .tetris-btn-drop {
    background: #b45309;
  }

  .tetris-btn-drop:active {
    background: #92400e;
  }

  .tetris-btn-hold {
    flex: 1;
    max-width: none;
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

    .tetris-btn-rotate-main {
      min-height: 128px;
      font-size: 2.25rem;
    }
  }
</style>

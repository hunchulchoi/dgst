<script lang="ts">
  import { resolve } from '$app/paths';
  import { beforeNavigate } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import { ko } from 'date-fns/locale';
  import { formatRelativeTime } from '$lib/util/formatRelativeTime.js';
  import GameRankingRow from '$lib/components/GameRankingRow.svelte';
  import { swalFire } from '$lib/util/swal.js';
  import type { PageData } from './$types';
  import {
    calculateHardDropScore,
    calculatePlacementScore,
    calculateSoftDropScore,
    canPlace,
    clearLines,
    createBonusBoard,
    createBonusQueue,
    createEmptyBoard,
    createStageBoard,
    drawNextPiece,
    ensureQueue,
    getGhostPiece,
    getPieceCells,
    getShapeMatrix,
    getStageConfig,
    getStageGarbageRows,
    hardDrop,
    isGameComplete,
    isSpawnBlocked,
    isStageComplete,
    lockPiece,
    movePiece,
    PIECE_COLORS,
    rotateActivePiece,
    shouldShowGhost,
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

  type Screen =
    | 'menu'
    | 'playing'
    | 'bonus'
    | 'paused'
    | 'stageClear'
    | 'bonusClear'
    | 'gameOver'
    | 'gameWin';

  let screen = $state<Screen>('menu');
  let board = $state<Board>(createEmptyBoard());
  let activePiece = $state<ActivePiece | null>(null);
  let nextQueue = $state<PieceType[]>([]);
  let previewPiece = $state<PieceType>('T');
  let stage = $state(1);
  let stageLines = $state(0);
  let totalLines = $state(0);
  let score = $state(0);
  let combo = $state(0);
  let backToBack = $state(false);
  let clearFeedback = $state<{ label: string; detail: string; points: number } | null>(null);
  let holdPiece = $state<PieceType | null>(null);
  let canHold = $state(true);
  let soundEnabled = $state(true);
  let dropInterval = $state<ReturnType<typeof setInterval> | null>(null);
  let stageClearTimeout: ReturnType<typeof setTimeout> | null = null;
  let clearFeedbackTimeout: ReturnType<typeof setTimeout> | null = null;
  let bonusInterval: ReturnType<typeof setInterval> | null = null;
  let bonusTimeLeft = $state(0);
  let bonusLines = $state(0);
  let bonusSourceStage = $state<number | null>(null);
  let bonusReviveEarned = $state(false);
  let reviveTokens = $state(0);
  let pausedFrom = $state<'playing' | 'bonus'>('playing');
  let rankList = $state<
    Array<{
      nickname: string;
      score: number;
      stage?: number;
      createdAt?: string;
      _id?: string;
      photo?: string | null;
    }>
  >([]);
  let myBestScore = $state<number | null>(null);
  let myBestStage = $state<number | null>(null);
  let myBestCreatedAt = $state<string | null>(null);
  let todayStats = $state<{ games: number; users: number }>({ games: 0, users: 0 });
  let rankLoading = $state(false);
  let canResume = $state(false);
  let newGameConfirming = $state(false);
  let resumeSummary = $state<{ stage: number; score: number; label: string } | null>(null);

  const STORAGE_KEY = 'dgst_tetris_state';
  const SOUND_PREF_KEY = 'dgst_tetris_sound';
  const SAVE_VERSION = 3;
  const PIECE_TYPES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  const BONUS_AFTER_STAGES = [3, 6, 9, 12, 15, 18] as const;
  const BONUS_SECONDS = 30;
  const RESUMABLE_SCREENS: Screen[] = ['playing', 'bonus', 'paused', 'stageClear', 'bonusClear'];
  const isLoggedIn = $derived(!!data.session?.user?.email);

  const stageConfig = $derived(getStageConfig(stage));
  const stageProgress = $derived(Math.min(100, (stageLines / stageConfig.linesTarget) * 100));
  const stageGarbageRows = $derived(getStageGarbageRows(stage));
  const dropMs = $derived(stageConfig.dropIntervalMs);
  const currentDropMs = $derived(screen === 'bonus' ? 260 : dropMs);
  const bonusProgress = $derived((bonusTimeLeft / BONUS_SECONDS) * 100);
  const isBonusContext = $derived(
    screen === 'bonus' || screen === 'bonusClear' || (screen === 'paused' && pausedFrom === 'bonus')
  );

  function hasBonusAfterStage(stageNumber: number): boolean {
    return BONUS_AFTER_STAGES.some((bonusStage) => bonusStage === stageNumber);
  }

  /** 렌더용 셀 (고정 블록 + 고스트 + 활성) */
  type RenderCell = { type: PieceType; ghost?: boolean } | null;

  const displayRows = $derived.by(() => {
    const rows: RenderCell[][] = board
      .slice(HIDDEN_ROWS)
      .map((row) => row.map((cell) => (cell ? { type: cell } : null)));

    if (activePiece && (screen === 'playing' || screen === 'bonus')) {
      if (shouldShowGhost(stage)) {
        const ghost = getGhostPiece(board, activePiece);
        for (const { x, y } of getPieceCells(ghost)) {
          const row = y - HIDDEN_ROWS;
          if (row >= 0 && row < ROWS && x >= 0 && x < COLS && rows[row][x] === null) {
            rows[row][x] = { type: ghost.type, ghost: true };
          }
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
      if (screen === 'bonus') {
        board = createEmptyBoard();
        combo = 0;
        backToBack = false;
        activePiece = piece;
        return true;
      }
      if (reviveTokens > 0) {
        reviveTokens -= 1;
        board = createEmptyBoard();
        combo = 0;
        backToBack = false;
        activePiece = piece;
        showGameFeedback('REVIVE!', '보드 초기화', 0);
        playTetrisSound('stage', soundEnabled);
        return true;
      }
      activePiece = piece;
      return false;
    }
    activePiece = piece;
    return true;
  }

  function startGame() {
    if (stageClearTimeout) clearTimeout(stageClearTimeout);
    if (clearFeedbackTimeout) clearTimeout(clearFeedbackTimeout);
    stopBonusTimer();
    clearSave();
    board = createEmptyBoard();
    nextQueue = ensureQueue([]);
    previewPiece = nextQueue[0] ?? 'T';
    stage = 1;
    stageLines = 0;
    totalLines = 0;
    score = 0;
    combo = 0;
    backToBack = false;
    clearFeedback = null;
    bonusTimeLeft = 0;
    bonusLines = 0;
    bonusSourceStage = null;
    bonusReviveEarned = false;
    reviveTokens = 0;
    pausedFrom = 'playing';
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
    stopBonusTimer();
    screen = 'gameOver';
    clearSave();
    playTetrisSound('over', soundEnabled);
    if (isLoggedIn) void submitGameScore(score, stage);
  }

  function startDropTimer() {
    stopDropTimer();
    dropInterval = setInterval(() => {
      softDrop();
    }, currentDropMs);
  }

  function stopDropTimer() {
    if (dropInterval) {
      clearInterval(dropInterval);
      dropInterval = null;
    }
  }

  function pauseGame() {
    if (screen !== 'playing' && screen !== 'bonus') return;
    pausedFrom = screen;
    screen = 'paused';
    stopDropTimer();
    stopBonusTimer();
  }

  function resumeGame() {
    if (screen !== 'paused') return;
    screen = pausedFrom;
    startDropTimer();
    if (screen === 'bonus') startBonusTimer();
    void focusBoard();
  }

  function togglePause() {
    if (screen === 'playing' || screen === 'bonus') pauseGame();
    else if (screen === 'paused') resumeGame();
  }

  /** 피스 고정 후 줄 처리 */
  function settlePiece(lockedBoard: Board, hardDropDistance = 0) {
    const { board: clearedBoard, linesCleared } = clearLines(lockedBoard);
    board = clearedBoard;
    const placementScore = calculatePlacementScore(linesCleared, stage, combo, backToBack);
    const scoreMultiplier = screen === 'bonus' ? 2 : 1;
    const earnedPlacementScore = placementScore.total * scoreMultiplier;
    combo = placementScore.nextCombo;
    backToBack = placementScore.nextBackToBack;
    if (linesCleared > 0) {
      score += earnedPlacementScore;
      if (screen === 'bonus') bonusLines += linesCleared;
      else stageLines += linesCleared;
      totalLines += linesCleared;
      showClearFeedback(linesCleared, earnedPlacementScore, placementScore.backToBackBonus > 0);
      playTetrisSound('clear', soundEnabled);
    }
    if (hardDropDistance > 0) {
      score += calculateHardDropScore(hardDropDistance);
    }

    if (screen === 'playing' && isStageComplete(stageLines, stage)) {
      handleStageClear();
      return;
    }

    if (!spawnFromQueue()) {
      endGameOver();
    }
  }

  function showGameFeedback(label: string, detail: string, points: number) {
    if (clearFeedbackTimeout) clearTimeout(clearFeedbackTimeout);
    clearFeedback = { label, detail, points };
    clearFeedbackTimeout = setTimeout(() => {
      clearFeedback = null;
      clearFeedbackTimeout = null;
    }, 950);
  }

  function showClearFeedback(linesCleared: number, points: number, isBackToBack: boolean) {
    const labels = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS!'];
    const detail = [screen === 'bonus' ? '2× BONUS' : '', combo > 1 ? `${combo} COMBO` : '']
      .filter(Boolean)
      .join(' · ');
    showGameFeedback(isBackToBack ? 'BACK-TO-BACK TETRIS!' : labels[linesCleared], detail, points);
  }

  function stopBonusTimer() {
    if (bonusInterval) {
      clearInterval(bonusInterval);
      bonusInterval = null;
    }
  }

  function startBonusTimer() {
    stopBonusTimer();
    bonusInterval = setInterval(() => {
      if (screen !== 'bonus') return;
      bonusTimeLeft = Math.max(0, bonusTimeLeft - 1);
      if (bonusTimeLeft === 0) finishBonusStage();
    }, 1000);
  }

  function startBonusStage() {
    if (stageClearTimeout) {
      clearTimeout(stageClearTimeout);
      stageClearTimeout = null;
    }
    bonusSourceStage = stage;
    bonusTimeLeft = BONUS_SECONDS;
    bonusLines = 0;
    bonusReviveEarned = false;
    board = createBonusBoard();
    nextQueue = createBonusQueue();
    previewPiece = nextQueue[0];
    holdPiece = null;
    canHold = true;
    combo = 0;
    backToBack = false;
    activePiece = null;
    screen = 'bonus';
    spawnFromQueue();
    startDropTimer();
    startBonusTimer();
    showGameFeedback('BONUS START!', '30초 · 점수 2배', 0);
    void focusBoard();
  }

  function finishBonusStage() {
    if (screen !== 'bonus') return;
    stopDropTimer();
    stopBonusTimer();
    activePiece = null;
    bonusReviveEarned = bonusLines >= 4;
    if (bonusReviveEarned) reviveTokens = Math.max(reviveTokens, 1);
    screen = 'bonusClear';
    playTetrisSound(bonusReviveEarned ? 'stage' : 'drop', soundEnabled);
    saveState();
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
    if (screen === 'stageClear' && hasBonusAfterStage(stage)) {
      startBonusStage();
      return;
    }

    const nextStage = (bonusSourceStage ?? stage) + 1;
    bonusSourceStage = null;
    bonusReviveEarned = false;
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
    bonusTimeLeft = 0;
    bonusLines = 0;
    combo = 0;
    backToBack = false;
    clearFeedback = null;
    holdPiece = null;
    canHold = true;
    activePiece = null;
    pausedFrom = 'playing';
    screen = 'playing';
    board = createStageBoard(nextStage);
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

  function softDrop(manual = false) {
    if (!activePiece || (screen !== 'playing' && screen !== 'bonus')) return;
    const moved = movePiece(activePiece, 0, 1);
    if (canPlace(board, moved)) {
      activePiece = moved;
      if (manual) score += calculateSoftDropScore(1);
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

  /** 모바일 한 손 제스처 조작 */
  let boardWrapEl = $state<HTMLDivElement | null>(null);
  let gestureStartX = 0;
  let gestureStartY = 0;
  let gestureAnchorX = 0;
  let gestureAnchorY = 0;
  let gestureStartAt = 0;
  let gestureActive = false;
  let gestureMoved = $state(false);
  let gestureSoftDropCount = 0;
  let longPressTriggered = false;
  let gestureMode: 'horizontal' | 'down' | null = null;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let softDropRepeatTimer: ReturnType<typeof setTimeout> | null = null;

  const SWIPE_STEP_PX = 26;
  const SWIPE_TAP_MAX_PX = 12;
  const SWIPE_TAP_MAX_MS = 280;
  const LONG_PRESS_MS = 450;
  const FLICK_UP_MIN_PX = 42;
  const FLICK_UP_MAX_MS = 320;
  const FLICK_UP_MIN_SPEED = 0.38;
  const DOWN_ACTIVATE_PX = 14;
  const SOFT_DROP_STEP_PX = 28;
  const SOFT_DROP_MIN_STEP_PX = 14;

  function canUseTouchControls(): boolean {
    return screen === 'playing' || screen === 'bonus' || screen === 'paused';
  }

  function shouldIgnoreGestureTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return true;
    const overlay = target.closest('.tetris-overlay');
    if (!overlay) return false;
    return !!target.closest('button, a, input');
  }

  function cancelLongPressTimer() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function clearSoftDropRepeatTimer() {
    if (softDropRepeatTimer) {
      clearTimeout(softDropRepeatTimer);
      softDropRepeatTimer = null;
    }
  }

  function resetGestureState() {
    gestureActive = false;
    gestureMoved = false;
    gestureSoftDropCount = 0;
    longPressTriggered = false;
    gestureMode = null;
    cancelLongPressTimer();
    clearSoftDropRepeatTimer();
  }

  function getSoftDropRepeatIntervalMs(): number {
    const holdMs = Date.now() - gestureStartAt;
    const accel = Math.min(60, Math.floor(holdMs / 300) * 15 + gestureSoftDropCount * 4);
    return Math.max(40, 120 - accel);
  }

  function getSoftDropStepPx(): number {
    const holdMs = Date.now() - gestureStartAt;
    const shrink = Math.floor(holdMs / 350) * 4;
    return Math.max(SOFT_DROP_MIN_STEP_PX, SOFT_DROP_STEP_PX - shrink);
  }

  function triggerSoftDropFromGesture() {
    gestureSoftDropCount += 1;
    runGameAction(() => softDrop(true));
  }

  function scheduleSoftDropRepeat() {
    clearSoftDropRepeatTimer();
    softDropRepeatTimer = setTimeout(() => {
      softDropRepeatTimer = null;
      if (!gestureActive || gestureMode !== 'down' || !canUseTouchControls()) return;
      triggerSoftDropFromGesture();
      scheduleSoftDropRepeat();
    }, getSoftDropRepeatIntervalMs());
  }

  function handleGestureTouchStart(e: TouchEvent) {
    if (!canUseTouchControls() || !e.touches.length || shouldIgnoreGestureTarget(e.target)) return;
    const touch = e.touches[0];
    gestureStartX = gestureAnchorX = touch.clientX;
    gestureStartY = gestureAnchorY = touch.clientY;
    gestureStartAt = Date.now();
    gestureActive = true;
    gestureMoved = false;
    gestureSoftDropCount = 0;
    longPressTriggered = false;
    gestureMode = null;

    cancelLongPressTimer();
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      if (!gestureActive || gestureMoved) return;
      longPressTriggered = true;
      runGameAction(holdPieceAction);
    }, LONG_PRESS_MS);
  }

  function handleGestureTouchMove(e: TouchEvent) {
    if (!gestureActive || !canUseTouchControls() || !e.touches.length || longPressTriggered) return;

    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;
    const totalDx = x - gestureStartX;
    const totalDy = y - gestureStartY;

    if (Math.abs(totalDx) > SWIPE_TAP_MAX_PX || Math.abs(totalDy) > SWIPE_TAP_MAX_PX) {
      gestureMoved = true;
      cancelLongPressTimer();
    }

    if (!gestureMoved) return;

    e.preventDefault();

    if (!gestureMode) {
      if (Math.abs(totalDx) >= DOWN_ACTIVATE_PX || Math.abs(totalDy) >= DOWN_ACTIVATE_PX) {
        if (Math.abs(totalDx) > Math.abs(totalDy)) {
          gestureMode = 'horizontal';
        } else if (totalDy > 0) {
          gestureMode = 'down';
          gestureAnchorY = y;
        }
      }
    }

    if (gestureMode === 'horizontal') {
      let diff = x - gestureAnchorX;
      while (diff >= SWIPE_STEP_PX) {
        runGameAction(() => moveHorizontal(1));
        gestureAnchorX += SWIPE_STEP_PX;
        diff = x - gestureAnchorX;
      }
      while (diff <= -SWIPE_STEP_PX) {
        runGameAction(() => moveHorizontal(-1));
        gestureAnchorX -= SWIPE_STEP_PX;
        diff = x - gestureAnchorX;
      }
      return;
    }

    if (gestureMode === 'down') {
      const step = getSoftDropStepPx();
      let diff = y - gestureAnchorY;
      while (diff >= step) {
        triggerSoftDropFromGesture();
        gestureAnchorY += step;
        diff = y - gestureAnchorY;
      }
      if (!softDropRepeatTimer) scheduleSoftDropRepeat();
    }
  }

  function handleGestureTouchEnd(e: TouchEvent) {
    cancelLongPressTimer();
    clearSoftDropRepeatTimer();

    if (!gestureActive || !canUseTouchControls()) {
      resetGestureState();
      return;
    }

    if (longPressTriggered) {
      resetGestureState();
      return;
    }

    if (!e.changedTouches.length) {
      resetGestureState();
      return;
    }

    const touch = e.changedTouches[0];
    const dx = touch.clientX - gestureStartX;
    const dy = touch.clientY - gestureStartY;
    const duration = Date.now() - gestureStartAt;

    if (
      !gestureMoved &&
      Math.abs(dx) < SWIPE_TAP_MAX_PX &&
      Math.abs(dy) < SWIPE_TAP_MAX_PX &&
      duration < SWIPE_TAP_MAX_MS
    ) {
      runGameAction(rotatePieceAction);
    } else if (
      dy < -FLICK_UP_MIN_PX &&
      duration <= FLICK_UP_MAX_MS &&
      Math.abs(dy) / duration >= FLICK_UP_MIN_SPEED &&
      Math.abs(dy) > Math.abs(dx)
    ) {
      runGameAction(dropHard);
    }

    resetGestureState();
  }

  function bindGestureListeners(el: HTMLDivElement | null) {
    if (!el) return () => {};
    const onMove = (e: TouchEvent) => handleGestureTouchMove(e);
    el.addEventListener('touchstart', handleGestureTouchStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', handleGestureTouchEnd, { passive: true });
    el.addEventListener('touchcancel', handleGestureTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', handleGestureTouchStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', handleGestureTouchEnd);
      el.removeEventListener('touchcancel', handleGestureTouchEnd);
      cancelLongPressTimer();
      clearSoftDropRepeatTimer();
    };
  }

  async function focusBoard() {
    await tick();
    boardWrapEl?.focus({ preventScroll: true });
  }

  /** 일시정지 중이면 재개 후 게임 입력 처리 */
  function runGameAction(action: () => void) {
    if (screen !== 'playing' && screen !== 'bonus' && screen !== 'paused') return;
    if (screen === 'paused') {
      resumeGame();
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
    if (screen === 'stageClear' || screen === 'bonusClear') {
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
        runGameAction(() => softDrop(true));
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
    combo: number;
    backToBack: boolean;
    bonusTimeLeft: number;
    bonusLines: number;
    bonusSourceStage: number | null;
    bonusReviveEarned: boolean;
    reviveTokens: number;
    pausedFrom: 'playing' | 'bonus';
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
      combo,
      backToBack,
      bonusTimeLeft,
      bonusLines,
      bonusSourceStage,
      bonusReviveEarned,
      reviveTokens,
      pausedFrom,
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
        !parsed.board.every((row) => row.every((cell) => cell === null || isValidPieceType(cell)))
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
    combo = Number.isInteger(saved.combo) && saved.combo >= 0 ? saved.combo : 0;
    backToBack = saved.backToBack === true;
    bonusTimeLeft = Number.isInteger(saved.bonusTimeLeft) ? Math.max(0, saved.bonusTimeLeft) : 0;
    bonusLines = Number.isInteger(saved.bonusLines) ? Math.max(0, saved.bonusLines) : 0;
    bonusSourceStage = Number.isInteger(saved.bonusSourceStage) ? saved.bonusSourceStage : null;
    bonusReviveEarned = saved.bonusReviveEarned === true;
    reviveTokens = Number.isInteger(saved.reviveTokens) ? Math.max(0, saved.reviveTokens) : 0;
    pausedFrom = saved.pausedFrom === 'bonus' ? 'bonus' : 'playing';
    clearFeedback = null;
    screen = saved.screen;

    stopDropTimer();
    stopBonusTimer();
    if (stageClearTimeout) {
      clearTimeout(stageClearTimeout);
      stageClearTimeout = null;
    }

    if (screen === 'playing') {
      screen = 'paused';
      pausedFrom = 'playing';
    } else if (screen === 'bonus') {
      screen = 'paused';
      pausedFrom = 'bonus';
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
  async function startNewGame() {
    if (newGameConfirming) return;
    if (canResume) {
      newGameConfirming = true;
      try {
        const result = await swalFire({
          title: '새 게임을 시작하시겠습니까?',
          text: '저장된 게임 진행 내용이 사라집니다.',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#0d6efd',
          cancelButtonColor: '#6c757d',
          confirmButtonText: '네, 새로 시작합니다',
          cancelButtonText: '취소',
          reverseButtons: true,
          heightAuto: false,
          allowOutsideClick: false
        });
        if (!result.isConfirmed) return;
      } finally {
        newGameConfirming = false;
      }
    }
    startGame();
  }

  /** 메뉴 이동 전 autosave */
  function goToMenu() {
    stopDropTimer();
    stopBonusTimer();
    if (stageClearTimeout) {
      clearTimeout(stageClearTimeout);
      stageClearTimeout = null;
    }
    if (screen === 'playing' || screen === 'bonus') {
      pausedFrom = screen;
      screen = 'paused';
    }
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
      stopBonusTimer();
      if (stageClearTimeout) clearTimeout(stageClearTimeout);
      if (clearFeedbackTimeout) clearTimeout(clearFeedbackTimeout);
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

  $effect(() => {
    const cleanup = bindGestureListeners(boardWrapEl);
    return cleanup;
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
  <title>테트리스 | dgst.me</title>
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
  />
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
                20단계 스테이지를 클리어하세요!<br />
                3단계마다 30초 보너스 도전이 열립니다.
              </p>
              <div class="d-flex flex-column align-items-center gap-2">
                {#if canResume && resumeSummary}
                  <div class="alert alert-light border w-100 mb-0 py-2 px-3 text-start">
                    <p class="small fw-semibold mb-1">저장된 게임</p>
                    <p class="small text-muted mb-0">
                      Stage {resumeSummary.stage} ({resumeSummary.label}) · {resumeSummary.score.toLocaleString()}점
                    </p>
                  </div>
                  <button
                    type="button"
                    class="btn btn-lg btn-primary px-5"
                    onclick={resumeSavedGame}
                  >
                    이어하기
                  </button>
                  <button
                    type="button"
                    class="btn btn-lg btn-outline-primary px-5"
                    onclick={startNewGame}
                    disabled={newGameConfirming}
                  >
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
                    <li>
                      Stage {s.stage} ({s.label}): {s.linesTarget}줄 · 낙하 {s.dropIntervalMs}ms
                      {#if getStageGarbageRows(s.stage) > 0}
                        · 방해 {getStageGarbageRows(s.stage)}줄
                      {/if}
                    </li>
                  {/each}
                </ul>
              </div>
            </div>
          {:else}
            <div class="d-flex justify-content-between align-items-start mb-2 flex-wrap gap-2">
              <div>
                {#if isBonusContext}
                  <h4 class="mb-0 bonus-title">⚡ BONUS <span>{bonusTimeLeft}s</span></h4>
                  <p class="small text-muted mb-0">
                    제거 {bonusLines}줄 · 점수 2배 · 4줄이면 부활권
                  </p>
                {:else}
                  <h4 class="mb-0">
                    Stage {stage}
                    <span class="badge bg-secondary ms-1">{stageConfig.label}</span>
                  </h4>
                  <p class="small text-muted mb-0">
                    목표 {stageLines}/{stageConfig.linesTarget}줄 · 총 {totalLines}줄
                    {#if stageGarbageRows > 0}
                      · 시작 방해 {stageGarbageRows}줄{/if}
                  </p>
                {/if}
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
                  disabled={screen === 'stageClear' ||
                    screen === 'bonusClear' ||
                    screen === 'gameOver' ||
                    screen === 'gameWin'}
                >
                  {screen === 'paused' ? '▶' : '⏸'}
                </button>
                <button type="button" class="btn btn-sm btn-outline-dark" onclick={goToMenu}>
                  메뉴
                </button>
              </div>
            </div>

            <div
              class="progress mb-3"
              style="height: 8px;"
              role="progressbar"
              aria-valuenow={isBonusContext ? bonusProgress : stageProgress}
            >
              <div
                class="progress-bar"
                class:bg-success={!isBonusContext}
                class:bg-warning={isBonusContext}
                style="width: {isBonusContext ? bonusProgress : stageProgress}%"
              ></div>
            </div>

            <div class="tetris-layout">
              <div
                class="tetris-board-wrap"
                class:tetris-board-gesturing={gestureMoved}
                bind:this={boardWrapEl}
                role="application"
                aria-label="테트리스 조작 영역"
                tabindex="-1"
              >
                <div
                  class="tetris-board"
                  class:tetris-board-clear={clearFeedback !== null}
                  class:tetris-board-bonus={isBonusContext}
                  aria-label="테트리스 보드"
                >
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

                  {#if clearFeedback}
                    <div class="tetris-clear-feedback" aria-live="polite">
                      <strong>{clearFeedback.label}</strong>
                      {#if clearFeedback.detail}<span>{clearFeedback.detail}</span>{/if}
                      {#if clearFeedback.points > 0}
                        <small>+{clearFeedback.points.toLocaleString()}</small>
                      {/if}
                    </div>
                  {/if}

                  {#if screen === 'paused'}
                    <div class="tetris-overlay">
                      <p class="tetris-overlay-title">일시정지</p>
                      <p class="small text-white-50 mb-2">스와이프·탭 또는 ▶로 계속</p>
                      <button type="button" class="btn btn-light btn-sm" onclick={resumeGame}
                        >계속</button
                      >
                    </div>
                  {/if}
                  {#if screen === 'stageClear'}
                    <div class="tetris-overlay tetris-overlay-clear">
                      <p class="tetris-overlay-title">Stage {stage} 클리어!</p>
                      <p class="small mb-2">점수 {score.toLocaleString()}</p>
                      <button type="button" class="btn btn-success btn-sm" onclick={advanceStage}>
                        {stage >= STAGES.length
                          ? '결과 보기'
                          : hasBonusAfterStage(stage)
                            ? '보너스 도전'
                            : '다음 스테이지'}
                      </button>
                    </div>
                  {/if}
                  {#if screen === 'bonusClear'}
                    <div class="tetris-overlay tetris-overlay-bonus">
                      <p class="tetris-overlay-title">
                        {bonusReviveEarned ? '⚡ 보너스 성공!' : '보너스 종료'}
                      </p>
                      <p class="small mb-1">{bonusLines}줄 제거 · 점수 {score.toLocaleString()}</p>
                      <p class="small mb-3 fw-semibold">
                        {bonusReviveEarned ? '🛡️ 부활권 1개 획득' : '4줄 제거 시 부활권 획득'}
                      </p>
                      <button type="button" class="btn btn-warning btn-sm" onclick={advanceStage}>
                        Stage {(bonusSourceStage ?? stage) + 1} 시작
                      </button>
                    </div>
                  {/if}
                  {#if screen === 'gameOver'}
                    <div class="tetris-overlay tetris-overlay-over">
                      <p class="tetris-overlay-title">게임 오버</p>
                      <p class="small mb-2">
                        Stage {stage} · {score.toLocaleString()}점
                        {#if isLoggedIn}<span class="d-block text-white-50">랭킹에 반영됨</span
                          >{/if}
                      </p>
                      <button type="button" class="btn btn-primary btn-sm" onclick={startNewGame}
                        >다시 하기</button
                      >
                    </div>
                  {/if}
                  {#if screen === 'gameWin'}
                    <div class="tetris-overlay tetris-overlay-win">
                      <p class="tetris-overlay-title">🎉 전체 클리어!</p>
                      <p class="small mb-2">
                        {score.toLocaleString()}점 · {totalLines}줄
                        {#if isLoggedIn}<span class="d-block text-white-50">랭킹에 반영됨</span
                          >{/if}
                      </p>
                      <button type="button" class="btn btn-warning btn-sm" onclick={startNewGame}
                        >다시 도전</button
                      >
                    </div>
                  {/if}
                </div>
              </div>

              <aside class="tetris-side" aria-label="게임 정보">
                <div class="tetris-panel">
                  <p class="tetris-panel-label">점수</p>
                  <p class="tetris-panel-value">{score.toLocaleString()}</p>
                  {#if combo > 1 || backToBack}
                    <p class="tetris-streak mb-0">
                      {#if combo > 1}{combo} COMBO{/if}
                      {#if combo > 1 && backToBack}<span> · </span>{/if}
                      {#if backToBack}<span>B2B</span>{/if}
                    </p>
                  {/if}
                </div>
                {#if reviveTokens > 0}
                  <div class="tetris-panel tetris-revive-panel">
                    <p class="tetris-panel-label">보유 보상</p>
                    <p class="tetris-panel-value">🛡️ × {reviveTokens}</p>
                    <p class="tetris-revive-help mb-0">게임오버 시 자동 부활</p>
                  </div>
                {/if}
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
                <div class="tetris-panel d-md-none">
                  <p class="tetris-panel-label small text-muted mb-1">터치 조작</p>
                  <ul class="small text-muted mb-0 ps-3 tetris-gesture-list">
                    <li>← → 스와이프 이동</li>
                    <li>↓ 스와이프 소프트 드롭</li>
                    <li>↑ 빠르게 하드 드롭</li>
                    <li>탭 회전</li>
                    <li>길게 누르기 홀드</li>
                  </ul>
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
            오늘 참여 <strong>{todayStats.users}</strong>명 · 게임
            <strong>{todayStats.games}</strong>회
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
            <ol class="list-group list-group-flush">
              {#each rankList as r, index (r._id ?? `${r.nickname}:${r.score}`)}
                <GameRankingRow
                  {index}
                  nickname={r.nickname}
                  photo={r.photo}
                  score={formatScore(r.score)}
                  meta={[
                    r.stage != null && r.stage > 0 ? `S${r.stage}` : '',
                    r.createdAt
                      ? formatRelativeTime(r.createdAt, { locale: ko, addSuffix: true })
                      : ''
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
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
    touch-action: none;
  }

  .tetris-board-wrap:focus-visible {
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.45);
    border-radius: 10px;
  }

  .tetris-board-gesturing {
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.3);
    border-radius: 10px;
  }

  .tetris-gesture-list li {
    margin-bottom: 2px;
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

  .tetris-board-clear {
    animation: board-pulse 180ms ease-out;
  }

  .tetris-board-bonus {
    border-color: #f59e0b;
    background: linear-gradient(180deg, #1f2937 0%, #172554 100%);
    box-shadow: 0 0 18px rgba(245, 158, 11, 0.35);
  }

  .bonus-title {
    color: #d97706;
    letter-spacing: 0.04em;
  }

  .bonus-title span {
    font-variant-numeric: tabular-nums;
  }

  .tetris-clear-feedback {
    position: absolute;
    z-index: 4;
    left: 50%;
    top: 48%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    color: #fff;
    text-align: center;
    white-space: nowrap;
    pointer-events: none;
    text-shadow:
      0 2px 6px #000,
      0 0 14px #fbbf24;
    animation: clear-pop 950ms ease-out forwards;
  }

  .tetris-clear-feedback strong {
    font-size: clamp(1.15rem, 6vw, 1.7rem);
    letter-spacing: 0.06em;
  }

  .tetris-clear-feedback span {
    color: #fde68a;
    font-weight: 800;
  }

  .tetris-clear-feedback small {
    font-weight: 700;
  }

  .tetris-streak {
    color: #d97706;
    font-size: 0.68rem;
    font-weight: 800;
    line-height: 1.15;
  }

  @keyframes board-pulse {
    50% {
      box-shadow: 0 0 24px rgba(251, 191, 36, 0.8);
    }
  }

  @keyframes clear-pop {
    0% {
      opacity: 0;
      transform: translate(-50%, -35%) scale(0.7);
    }
    18% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1.12);
    }
    72% {
      opacity: 1;
      transform: translate(-50%, -55%) scale(1);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -75%) scale(0.92);
    }
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
    box-shadow:
      inset 2px 2px 0 rgba(255, 255, 255, 0.35),
      inset -2px -2px 0 rgba(0, 0, 0, 0.25);
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

  .tetris-overlay-bonus {
    background: linear-gradient(145deg, rgba(146, 64, 14, 0.94), rgba(30, 58, 138, 0.94));
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

  .tetris-revive-panel {
    background: #fffbeb;
    border: 1px solid #fcd34d;
  }

  .tetris-revive-help {
    color: #92400e;
    font-size: 0.62rem;
    line-height: 1.15;
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
  }
</style>

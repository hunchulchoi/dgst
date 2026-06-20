<script>
  import { onMount, tick } from 'svelte';
  import { beforeNavigate } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { browser } from '$app/environment';
  import { ko } from 'date-fns/locale';
  import { formatRelativeTime } from '$lib/util/formatRelativeTime.js';
  import { swalFire } from '$lib/util/swal.js';
  let { data } = $props();

  /** @typedef {'beginner' | 'intermediate' | 'expert'} Difficulty */
  /** @typedef {{ row: number; col: number; isMine: boolean; isRevealed: boolean; isFlagged: boolean; neighborMines: number }} Cell */
  /** @typedef {{ row: number; col: number }} GridPoint */
  /** @typedef {{ games: number; users: number }} TodayStats */

  let mode = $state(/** @type {Difficulty | null} */ (null));
  let rows = $state(9);
  let cols = $state(9);
  let totalMines = $state(10);
  let showHelp = $state(true);
  let highlightCenter = $state(/** @type {GridPoint | null} */ (null));

  let grid = $state(/** @type {Cell[][]} */ ([]));
  let gameOver = $state(false);
  let gameWon = $state(false);
  let firstClick = $state(true);
  let flagsPlaced = $state(0);
  let useFlagMode = $state(false);

  let explodedMine = $state(/** @type {GridPoint | null} */ (null));

  let timer = $state(0);
  /** @type {ReturnType<typeof setInterval> | null} */
  let timerInterval = null;
  let isPaused = $state(false);

  const STORAGE_KEY = 'minesweeper_save';

  let rankList = $state(/** @type {Array<{ nickname: string; time: number; createdAt?: string }>} */ ([]));
  let myBestTime = $state(/** @type {number | null} */ (null));
  let myBestCreatedAt = $state(/** @type {string | null} */ (null));
  let todayStats = $state(/** @type {TodayStats} */ ({ games: 0, users: 0 }));
  let rankLoading = $state(false);

  $effect.pre(() => {
    todayStats = data.todayStats || { games: 0, users: 0 };
  });

  const isLoggedIn = $derived(!!data.session?.user?.email);

  let minesLeft = $derived(totalMines - flagsPlaced);

  $effect(() => {
    if (mode && isLoggedIn) {
      loadRank();
    }
  });

  async function loadRank() {
    if (!mode) return;
    rankLoading = true;
    try {
      const res = await fetch(`/games/minesweeper?rank=1&mode=${mode}&_=${Date.now()}`, {
        cache: 'no-store'
      });
      if (res.ok) {
        const j = await res.json();
        rankList = j.rank ?? [];
        if (j.myBest && typeof j.myBest === 'object') {
          myBestTime = j.myBest.time != null ? Number(j.myBest.time) : null;
          myBestCreatedAt = j.myBest.createdAt ?? null;
        } else {
          myBestTime = j.myBest != null ? Number(j.myBest) : null;
          myBestCreatedAt = null;
        }
        if (j.todayStats) todayStats = j.todayStats;
      }
    } catch {
      rankList = [];
      myBestTime = null;
      myBestCreatedAt = null;
    } finally {
      rankLoading = false;
    }
  }

  /**
   * @param {number} timeScore
   * @param {Difficulty} winMode
   */
  async function submitWinScore(timeScore, winMode) {
    if (!isLoggedIn) return;
    try {
      const res = await fetch('/games/minesweeper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ time: timeScore, mode: winMode })
      });
      if (res.ok) await loadRank();
    } catch (e) {
      console.error('Score submit error', e);
    }
  }

  /** @param {Difficulty} difficulty */
  function startGame(difficulty) {
    mode = difficulty;
    if (difficulty === 'beginner') {
      rows = 9;
      cols = 9;
      totalMines = 10;
    } else if (difficulty === 'intermediate') {
      rows = 16;
      cols = 16;
      totalMines = 40;
    } else if (difficulty === 'expert') {
      rows = 16;
      cols = 30;
      totalMines = 99;
    }
    clearSave();
    initGrid();
  }

  /** @param {Difficulty} newMode */
  async function confirmModeChange(newMode) {
    if (mode === newMode) return;
    if (!gameOver && !firstClick) {
      const result = await swalFire({
        title: '난이도를 변경하시겠습니까?',
        text: '현재 진행 중인 게임이 사라지고 새로운 난이도로 시작됩니다.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#0d6efd',
        cancelButtonColor: '#6c757d',
        confirmButtonText: '네, 변경합니다',
        cancelButtonText: '취소',
        reverseButtons: true
      });
      if (!result.isConfirmed) return;
    }
    startGame(newMode);
  }

  function initGrid() {
    gameOver = false;
    gameWon = false;
    firstClick = true;
    flagsPlaced = 0;
    timer = 0;
    explodedMine = null;
    useFlagMode = false;

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    isPaused = false;

    /** @type {Cell[][]} */
    const newGrid = [];
    for (let r = 0; r < rows; r++) {
      /** @type {Cell[]} */
      const row = [];
      for (let c = 0; c < cols; c++) {
        row.push({
          row: r,
          col: c,
          isMine: false,
          isRevealed: false,
          isFlagged: false,
          neighborMines: 0
        });
      }
      newGrid.push(row);
    }
    grid = newGrid;
  }

  async function handleReset() {
    if (!gameOver && !firstClick) {
      const result = await swalFire({
        title: '재시작 하시겠습니까?',
        text: '현재 진행 중인 게임이 사라집니다.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#0d6efd',
        cancelButtonColor: '#6c757d',
        confirmButtonText: '네, 다시 시작합니다',
        cancelButtonText: '취소',
        reverseButtons: true
      });
      if (!result.isConfirmed) return;
    }
    initGrid();
  }

  /**
   * @param {number} firstRow
   * @param {number} firstCol
   */
  function placeMines(firstRow, firstCol) {
    let minesPlaced = 0;
    while (minesPlaced < totalMines) {
      const r = Math.floor(Math.random() * rows);
      const c = Math.floor(Math.random() * cols);

      // 첫 클릭이나 그 주변 8칸에는 지뢰 배치 안 함 (안전 구역)
      if (Math.abs(r - firstRow) <= 1 && Math.abs(c - firstCol) <= 1) continue;

      if (!grid[r][c].isMine) {
        grid[r][c].isMine = true;
        minesPlaced++;
      }
    }

    // 이웃한 지뢰 개수 계산
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!grid[r][c].isMine) {
          let count = 0;
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const nr = r + dr;
              const nc = c + dc;
              if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc].isMine) {
                count++;
              }
            }
          }
          grid[r][c].neighborMines = count;
        }
      }
    }
    grid = [...grid];
  }

  /**
   * @param {number} r
   * @param {number} c
   */
  function revealCell(r, c) {
    if (gameOver || gameWon || grid[r][c].isRevealed || grid[r][c].isFlagged) return;

    if (firstClick) {
      firstClick = false;
      placeMines(r, c);
      startTimer();
    }

    grid[r][c].isRevealed = true;
    grid = [...grid];

    if (grid[r][c].isMine) {
      gameOver = true;
      explodedMine = { row: r, col: c };
      stopTimer();
      clearSave();
      revealAllMines();
      return;
    }

    // 빈 칸이면 이어지는 빈 칸들 자동으로 까기 (Flood fill)
    if (grid[r][c].neighborMines === 0) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            revealCell(nr, nc);
          }
        }
      }
    }

    checkWinCondition();
  }

  function startTimer() {
    if (timerInterval) return;
    timerInterval = setInterval(() => {
      if (!isPaused) {
        timer++;
        if (timer > 999) timer = 999;
      }
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function togglePause() {
    if (gameOver || firstClick) return;
    isPaused = !isPaused;
    if (isPaused) {
      saveGame();
    }
  }

  function saveGame() {
    if (gameOver || firstClick || !mode) return;
    const saveData = {
      mode,
      rows,
      cols,
      totalMines,
      grid,
      gameOver,
      gameWon,
      firstClick,
      flagsPlaced,
      timer,
      explodedMine,
      timestamp: Date.now()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saveData));
  }

  function loadSavedGame() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const data = JSON.parse(saved);
      // 24시간 이내의 저장 데이터만 유효하다고 가정 (선택 사항)
      if (Date.now() - data.timestamp > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }

      mode = data.mode;
      rows = data.rows;
      cols = data.cols;
      totalMines = data.totalMines;
      grid = data.grid;
      gameOver = data.gameOver;
      gameWon = data.gameWon;
      firstClick = data.firstClick;
      flagsPlaced = data.flagsPlaced;
      timer = data.timer;
      explodedMine = data.explodedMine;
      isPaused = true; // 불러오면 일단 일시정지 상태로
      showHelp = false;

      if (!gameOver && !firstClick) {
        startTimer();
      }
    } catch (e) {
      console.error('불러오기 실패', e);
    }
  }

  function clearSave() {
    localStorage.removeItem(STORAGE_KEY);
  }

  /**
   * @param {MouseEvent} e
   * @param {number} r
   * @param {number} c
   */
  function toggleFlag(e, r, c) {
    e.preventDefault();
    if (gameOver || gameWon || grid[r][c].isRevealed) return;

    grid[r][c].isFlagged = !grid[r][c].isFlagged;
    flagsPlaced += grid[r][c].isFlagged ? 1 : -1;
    grid = [...grid];
    checkWinCondition();
  }

  /** @param {number} r @param {number} c */
  function activateCell(r, c) {
    if (isPaused) return;
    const cell = grid[r][c];
    if (cell.isRevealed) {
      handleChord(r, c);
      setHighlight(r, c);
    } else if (useFlagMode) {
      grid[r][c].isFlagged = !grid[r][c].isFlagged;
      flagsPlaced += grid[r][c].isFlagged ? 1 : -1;
      grid = [...grid];
      checkWinCondition();
    } else {
      clearHighlight();
      revealCell(r, c);
    }
  }

  /** @param {KeyboardEvent} e @param {number} r @param {number} c */
  function handleCellKeydown(e, r, c) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activateCell(r, c);
    }
  }

  /**
   * @param {number} r
   * @param {number} c
   */
  function handleChord(r, c) {
    if (!grid[r][c].isRevealed || grid[r][c].neighborMines === 0) return;
    let flaggedNeighbors = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc].isFlagged) {
          flaggedNeighbors++;
        }
      }
    }
    // 깃발 개수와 주변 숫자가 일치할 때 클릭하면 나머지 안 까진 영역 바로 파기
    if (flaggedNeighbors === grid[r][c].neighborMines) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (
            nr >= 0 &&
            nr < rows &&
            nc >= 0 &&
            nc < cols &&
            !grid[nr][nc].isFlagged &&
            !grid[nr][nc].isRevealed
          ) {
            revealCell(nr, nc);
          }
        }
      }
    }
  }

  function revealAllMines() {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c].isMine && !grid[r][c].isFlagged) {
          grid[r][c].isRevealed = true;
        }
      }
    }
    grid = [...grid];
  }

  function checkWinCondition() {
    if (gameOver) return;
    let unrevealedSafeCells = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!grid[r][c].isMine && !grid[r][c].isRevealed) {
          unrevealedSafeCells++;
        }
      }
    }
    if (unrevealedSafeCells === 0) {
      gameWon = true;
      gameOver = true;
      stopTimer();
      clearSave();
      if (mode) void submitWinScore(timer, mode);
      // 다 이겼으면 남은 지뢰에 자동 깃발처리
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (grid[r][c].isMine && !grid[r][c].isFlagged) {
            grid[r][c].isFlagged = true;
            flagsPlaced++;
          }
        }
      }
      grid = [...grid];
    }
  }

  function clearHighlight() {
    highlightCenter = null;
  }

  /**
   * @param {number} r
   * @param {number} c
   */
  function setHighlight(r, c) {
    if (mode === 'beginner' && grid[r][c].isRevealed && grid[r][c].neighborMines > 0) {
      if (highlightCenter?.row === r && highlightCenter?.col === c) {
        highlightCenter = null;
      } else {
        highlightCenter = { row: r, col: c };
      }
    } else {
      highlightCenter = null;
    }
  }

  onMount(() => {
    loadSavedGame();
    return () => {
      saveGame();
      stopTimer();
    };
  });

  beforeNavigate(() => {
    saveGame();
  });

  /** 게임 중 보드 전체를 페이지 스크롤로 탐색 (보드 내부 스크롤 없음) */
  $effect(() => {
    if (!browser || mode == null) return;

    /** @type {Element | null | undefined} */
    let pageTransition;
    /** @type {Element | null | undefined} */
    let appShell;

    const enablePageScroll = async () => {
      await tick();
      appShell = document.querySelector('.app-shell');
      pageTransition = document.querySelector('.page-transition');
      document.documentElement.classList.add('minesweeper-page-scroll');
      document.body.classList.add('minesweeper-page-scroll');
      appShell?.classList.add('minesweeper-page-scroll');
      pageTransition?.classList.add('minesweeper-page-scroll');
    };

    void enablePageScroll();

    return () => {
      document.documentElement.classList.remove('minesweeper-page-scroll');
      document.body.classList.remove('minesweeper-page-scroll');
      (appShell ?? document.querySelector('.app-shell'))?.classList.remove(
        'minesweeper-page-scroll'
      );
      (pageTransition ?? document.querySelector('.page-transition'))?.classList.remove(
        'minesweeper-page-scroll'
      );
    };
  });
</script>

<svelte:head>
  <title>지뢰찾기 | dgst.me</title>
  {#if mode != null}
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, minimum-scale=0.25, maximum-scale=5, user-scalable=yes, viewport-fit=cover"
    />
  {/if}
</svelte:head>

<div
  class="minesweeper-game-root py-4 position-relative {mode != null
    ? 'minesweeper-game-active container-fluid px-0 px-md-2 px-lg-5'
    : 'container'}"
>
  <!-- 도움말 오버레이 -->
  {#if showHelp}
    <div
      class="instructions-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="minesweeper-help-title"
    >
      <div class="instructions-overlay-panel card shadow-lg border-0 rounded-4 overflow-hidden">
        <div class="card-header bg-primary text-white text-center py-3 flex-shrink-0">
          <h5 class="mb-0" id="minesweeper-help-title">지뢰찾기 가이드 💣</h5>
        </div>
        <div class="instructions-overlay-body card-body p-4">
          <div class="mb-4">
            <h6 class="fw-bold mb-3"><i class="bi bi-pc-display me-2"></i>PC 조작법</h6>
            <ul class="list-unstyled small mb-0">
              <li class="mb-2">🖱️ <strong>좌클릭:</strong> 땅 파기</li>
              <li class="mb-2">🚩 <strong>우클릭:</strong> 깃발 꽂기/해제</li>
              <li>
                ⚡ <strong>숫자 클릭:</strong> 주변 깃발 수가 맞으면 나머지 칸 자동 파기 (Chord)
              </li>
            </ul>
          </div>
          <hr />
          <div class="mb-4">
            <h6 class="fw-bold mb-3"><i class="bi bi-phone me-2"></i>모바일 조작법</h6>
            <ul class="list-unstyled small mb-0">
              <li class="mb-2">⛏️ <strong>기본 모드:</strong> 터치해서 땅 파기</li>
              <li class="mb-2">
                🚩 <strong>깃발 모드:</strong> 상단 스위치를 켜고 터치해서 깃발 꽂기
              </li>
              <li class="mb-2">
                👆 <strong>보드가 크면:</strong> 페이지를 스크롤해서 이동할 수 있어요
              </li>
              <li>🔍 <strong>전체 보기:</strong> 두 손가락으로 핀치해서 축소·확대할 수 있어요</li>
            </ul>
          </div>
          <div class="alert alert-info small mb-0 py-2">
            💡 <strong>팁:</strong> 첫 클릭은 항상 안전합니다! 게임 중 상단의
            <strong>🙂 스마일 버튼</strong>을 누르면 언제든 다시 시작할 수 있습니다.
          </div>
        </div>
        <div class="instructions-overlay-footer card-footer bg-white border-top-0 pt-0 pb-3 px-4">
          <button class="btn btn-primary w-100 py-2 fw-bold" onclick={() => (showHelp = false)}>
            알겠어요! 게임 시작하기
          </button>
        </div>
      </div>
    </div>
  {/if}

  <div
    class="row {mode != null
      ? 'g-0 justify-content-start align-items-start minesweeper-game-row'
      : 'justify-content-center'}"
  >
    <!-- 랭킹 영역 (md 이상: 오른쪽) -->
    {#if mode != null}
      <div class="col-12 col-md-auto order-2 order-md-2 mt-3 mt-md-0 minesweeper-rank-col">
        <div class="card shadow rounded-4 h-100">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <h5 class="mb-0">
                {mode === 'beginner' ? '초급' : mode === 'intermediate' ? '중급' : '고급'} Top 10
              </h5>
              {#if isLoggedIn}
                <button
                  class="btn btn-sm btn-outline-secondary"
                  onclick={loadRank}
                  disabled={rankLoading}
                >
                  🔄
                </button>
              {:else}
                <a href={resolve('/login')} class="btn btn-sm btn-outline-primary">로그인</a>
              {/if}
            </div>
            <p class="small text-muted mb-1">전체 기간 1인 1최단기록</p>
            <p class="small text-muted mb-3">
              오늘 참여 {todayStats.users}명 / 완료 {todayStats.games}회
            </p>

            {#if isLoggedIn}
              {#if myBestTime != null}
                <div class="alert alert-info py-2 px-3 mb-3 small">
                  내 전체 최고 기록: <strong>{myBestTime}</strong>초{#if myBestCreatedAt}
                    · {formatRelativeTime(myBestCreatedAt, { locale: ko, addSuffix: true })}{/if}
                </div>
              {/if}
              {#if rankList.length > 0}
                <ol class="list-group list-group-numbered">
                  {#each rankList as r (`${r.nickname}:${r.time}`)}
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                      <span>{r.nickname}</span>
                      <span class="text-end">
                        <span class="fw-bold font-monospace text-danger">{r.time}초</span>
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
                <p class="small text-muted text-center py-3">아직 등록된 랭킹이 없습니다.</p>
              {/if}
            {:else}
              <div class="alert alert-light text-center">
                <p class="small text-muted mb-2">로그인 후 랭킹을 확인할 수 있습니다.</p>
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/if}

    <!-- 게임 보드 영역 -->
    <div
      class="col-12 {mode != null
        ? 'order-1 order-md-1 minesweeper-game-col text-start'
        : 'text-center'}"
    >
      <div class="minesweeper-board-scroll">
        <div class="card shadow rounded-4 mb-3 d-inline-flex minesweeper-game-card">
          <div class="card-body {mode != null ? 'minesweeper-game-card-body' : ''}">
            {#if mode == null}
              <div class="text-center py-4 px-2 px-md-5">
                <h4 class="mb-3">지뢰찾기 💣</h4>
                <p class="text-muted mb-4">난이도를 선택하세요</p>
                <div class="d-flex flex-column gap-3">
                  <button
                    class="btn btn-lg btn-outline-success border-2 fw-bold"
                    onclick={() => startGame('beginner')}
                  >
                    초급 <small class="d-block text-muted">9×9, 지뢰 10개</small>
                  </button>
                  <button
                    class="btn btn-lg btn-outline-warning border-2 fw-bold"
                    onclick={() => startGame('intermediate')}
                  >
                    중급 <small class="d-block text-muted">16×16, 지뢰 40개</small>
                  </button>
                  <button
                    class="btn btn-lg btn-outline-danger border-2 fw-bold"
                    onclick={() => startGame('expert')}
                  >
                    고급 <small class="d-block text-muted">30×16, 지뢰 99개</small>
                  </button>
                </div>
              </div>
            {:else}
              <!-- 헤더 툴바 -->
              <div
                class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2 text-start {mode !=
                null
                  ? 'minesweeper-toolbar'
                  : 'px-2 px-md-0'}"
              >
                <h4 class="mb-0 fw-bold">
                  지뢰찾기 <span class="badge bg-secondary ms-2 fw-normal">
                    {mode === 'beginner' ? '초급' : mode === 'intermediate' ? '중급' : '고급'}
                  </span>
                </h4>
                <div class="d-flex align-items-center gap-2">
                  {#if !gameOver}
                    <button
                      class="btn btn-sm {isPaused ? 'btn-success' : 'btn-warning'} shadow-sm"
                      onclick={togglePause}
                    >
                      {isPaused ? '▶️ 재개' : '⏸️ 일시정지'}
                    </button>
                  {/if}
                  <button class="btn btn-sm btn-outline-secondary" onclick={handleReset}>
                    새 게임
                  </button>
                  <div class="btn-group btn-group-sm shadow-sm">
                    <button
                      class="btn btn-outline-success {mode === 'beginner' ? 'active' : ''}"
                      onclick={() => confirmModeChange('beginner')}
                    >
                      초급
                    </button>
                    <button
                      class="btn btn-outline-warning {mode === 'intermediate' ? 'active' : ''}"
                      onclick={() => confirmModeChange('intermediate')}
                    >
                      중급
                    </button>
                    <button
                      class="btn btn-outline-danger {mode === 'expert' ? 'active' : ''}"
                      onclick={() => confirmModeChange('expert')}
                    >
                      고급
                    </button>
                  </div>
                  <!-- 
                <button
                  class="btn btn-sm btn-outline-dark"
                  onclick={() => {
                    mode = null;
                  }}
                >
                  모드 변경
                </button>
                -->
                </div>
              </div>

              <div class="minesweeper-wrapper d-inline-block rounded">
                <!-- 클래식 느낌의 상단 상태 표시줄 -->
                <div
                  class="minesweeper-header bg-dark text-white rounded p-2 mb-3 d-flex justify-content-between align-items-center fw-bold fs-4 shadow-inner"
                  style="border: 3px inset #666;"
                >
                  <!-- 왼쪽: 남은 지뢰 숫자 -->
                  <div
                    class="text-danger flex-fill text-start font-monospace digital-font"
                    style="min-width: 3.5rem;"
                  >
                    {('00' + Math.max(0, minesLeft)).slice(-3)}
                  </div>

                  <!-- 가운데: 스마일 페이스 (새 게임/재시작) -->
                  <div class="flex-fill text-center">
                    <button
                      class="btn p-0 face-btn"
                      onclick={handleReset}
                      title="게임을 다시 시작합니다"
                    >
                      {#if gameWon}😎{:else if gameOver}😵{:else}🙂{/if}
                    </button>
                  </div>

                  <!-- 오른쪽: 경과 시간(타이머) -->
                  <div
                    class="text-danger flex-fill text-end font-monospace digital-font"
                    style="min-width: 3.5rem;"
                  >
                    {('00' + timer).slice(-3)}
                  </div>
                </div>

                <!-- 모바일 대응 툴바: 깃발 모드 토글 -->
                <div class="d-block d-md-none mb-3 text-center bg-light border p-2 rounded">
                  <div class="form-check form-switch d-inline-block m-0">
                    <input
                      class="form-check-input"
                      type="checkbox"
                      id="flagSwitch"
                      bind:checked={useFlagMode}
                      style="width: 2.5em; height: 1.25em;"
                    />
                    <label class="form-check-label fw-bold ms-2" for="flagSwitch">
                      현재 모드: {useFlagMode ? '🚩 깃발 꽂기' : '⛏ 칸 파기'}
                    </label>
                  </div>
                </div>

                <!-- 게임 보드 -->
                <div
                  class="minesweeper-board d-inline-block p-1 bg-secondary rounded user-select-none shadow"
                >
                  <div class="grid-container" style="--cols: {cols};">
                    {#each grid as row, rowIndex (row[0]?.row ?? `row-${rowIndex}`)}
                      {#each row as cell (`${cell.row}:${cell.col}`)}
                        <div
                          role="button"
                          tabindex="0"
                          class="grid-cell"
                          class:revealed={cell.isRevealed}
                          class:mine={cell.isRevealed && cell.isMine}
                          class:exploded={cell.isRevealed &&
                            cell.isMine &&
                            explodedMine?.row === cell.row &&
                            explodedMine?.col === cell.col}
                          class:wrong-flag={gameOver && !gameWon && cell.isFlagged && !cell.isMine}
                          class:flagged={cell.isFlagged}
                          class:neighbor-highlight={highlightCenter &&
                            Math.abs(cell.row - highlightCenter.row) <= 1 &&
                            Math.abs(cell.col - highlightCenter.col) <= 1}
                          aria-label="칸 ({cell.row + 1}, {cell.col + 1})"
                          oncontextmenu={(e) => toggleFlag(e, cell.row, cell.col)}
                          onmouseenter={() => setHighlight(cell.row, cell.col)}
                          onmouseleave={clearHighlight}
                          onclick={() => activateCell(cell.row, cell.col)}
                          onkeydown={(e) => handleCellKeydown(e, cell.row, cell.col)}
                        >
                          {#if cell.isRevealed}
                            {#if cell.isMine}
                              💣
                            {:else if cell.neighborMines > 0}
                              <span class="c{cell.neighborMines}">{cell.neighborMines}</span>
                            {/if}
                          {:else if cell.isFlagged}
                            {#if gameOver && !gameWon && !cell.isMine}
                              ❌
                            {:else}
                              🚩
                            {/if}
                          {/if}
                        </div>
                      {/each}
                    {/each}
                  </div>

                  {#if isPaused}
                    <div
                      class="pause-overlay"
                      role="button"
                      tabindex="0"
                      aria-label="게임 재개"
                      onclick={togglePause}
                      onkeydown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          togglePause();
                        }
                      }}
                    >
                      <div class="text-white text-center">
                        <div class="fs-1 mb-2">⏸️</div>
                        <div class="fw-bold">일시정지 중</div>
                        <div class="small opacity-75">클릭하면 재개합니다</div>
                      </div>
                    </div>
                  {/if}
                </div>
              </div>

              <p class="small text-muted text-center mt-3 mb-0">
                모바일에서는 우측 상단 토글로 🚩깃발 모드를 쓸 수 있어요.<br />
                보드가 화면보다 크면 페이지를 스크롤하거나 핀치로 축소·확대할 수 있어요.<br />
                컴퓨터에서는 우클릭으로 깃발을 꽂고 숫자 클릭 시 나머지를 한번에 팔 수 있어요!<br />
                {#if isLoggedIn && gameWon}
                  <span class="text-success fw-bold"
                    >승리 점수(소요시간)가 랭킹에 기록되었습니다!</span
                  >
                {/if}
              </p>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  :global(html.minesweeper-page-scroll),
  :global(body.minesweeper-page-scroll) {
    overflow-x: hidden !important;
    overflow-y: auto !important;
    max-width: none !important;
    width: 100% !important;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y pinch-zoom;
  }

  :global(.page-transition.minesweeper-page-scroll) {
    overflow-x: hidden !important;
    overflow-y: visible !important;
    max-width: none !important;
    width: 100%;
    min-width: 100%;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y pinch-zoom;
  }

  :global(.app-shell.minesweeper-page-scroll) {
    overflow-x: hidden !important;
    max-width: none !important;
    width: 100% !important;
    min-width: 100%;
  }

  :global(.page-transition.minesweeper-page-scroll) .minesweeper-game-root,
  :global(.page-transition.minesweeper-page-scroll) .container,
  :global(.page-transition.minesweeper-page-scroll) .container-fluid {
    max-width: none !important;
  }

  .minesweeper-game-root.minesweeper-game-active {
    width: 100% !important;
    min-width: 100%;
    max-width: 100% !important;
    overflow: hidden;
    touch-action: pan-x pan-y pinch-zoom;
  }

  .minesweeper-game-root.minesweeper-game-active > .minesweeper-game-row {
    width: 100%;
    min-width: 100%;
    max-width: 100%;
    margin-left: 0;
    margin-right: 0;
    flex-wrap: wrap;
  }

  .minesweeper-rank-col {
    align-self: flex-start;
    padding-left: 0;
    padding-right: 0.75rem;
    box-sizing: border-box;
    max-width: 100vw;
  }

  @media (min-width: 768px) {
    .minesweeper-rank-col {
      min-width: 300px;
      max-width: 300px;
      width: 300px !important;
      flex: 0 0 auto !important;
      margin-left: 0.75rem;
    }

    .minesweeper-game-root.minesweeper-game-active > .minesweeper-game-row {
      flex-wrap: nowrap;
    }
  }

  @media (max-width: 1004px),
    (orientation: landscape) and (max-width: 991.98px) and (max-height: 500px) {
    .minesweeper-game-root.minesweeper-game-active {
      width: 100% !important;
      max-width: 100% !important;
      overflow-x: hidden;
    }

    .minesweeper-game-root.minesweeper-game-active > .minesweeper-game-row {
      width: 100%;
      max-width: 100%;
      flex-direction: column;
      align-items: flex-start;
    }

    .minesweeper-rank-col {
      order: 2 !important;
      width: 100vw !important;
      max-width: 100vw !important;
      min-width: 0 !important;
      flex: 0 0 auto !important;
      margin-top: 1rem !important;
      margin-left: 0;
      margin-right: 0;
      padding-left: max(0.5rem, env(safe-area-inset-left, 0px));
      padding-right: max(0.5rem, env(safe-area-inset-right, 0px));
      overflow-x: hidden;
    }

    .minesweeper-rank-col :global(.card) {
      width: 100%;
      max-width: 100%;
    }
  }

  .minesweeper-game-active .minesweeper-game-col {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0;
    flex: 1 1 auto !important;
    padding-left: 0;
    padding-right: 0;
  }

  .minesweeper-game-active .minesweeper-game-card-body {
    padding: 0.5rem;
  }

  .minesweeper-board-scroll {
    width: 100%;
    max-width: 100%;
    overflow: auto;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-x pan-y pinch-zoom;
  }

  .minesweeper-game-active .minesweeper-toolbar {
    padding-left: 0.25rem;
    padding-right: 0.25rem;
  }

  .minesweeper-game-active .minesweeper-wrapper {
    padding: 0.25rem;
  }

  @media (min-width: 768px) {
    .minesweeper-game-active .minesweeper-game-card-body {
      padding: 1rem;
    }

    .minesweeper-game-active .minesweeper-toolbar {
      padding-left: 0;
      padding-right: 0;
    }

    .minesweeper-game-active .minesweeper-wrapper {
      padding: 1rem;
    }
  }

  .minesweeper-game-active .minesweeper-game-card {
    width: max-content;
    max-width: none;
  }

  .minesweeper-game-active .minesweeper-game-card,
  .minesweeper-game-active .minesweeper-game-card :global(.card-body) {
    overflow: visible;
    max-width: none;
  }

  @media (max-width: 767.98px),
    (orientation: landscape) and (max-width: 991.98px) and (max-height: 500px) {
    .minesweeper-game-active .minesweeper-game-col {
      order: 1 !important;
      width: 100vw !important;
      max-width: 100vw !important;
      overflow-x: hidden;
    }

    .minesweeper-board-scroll {
      width: 100vw;
      max-width: 100vw;
      overflow: auto;
    }
  }

  .minesweeper-wrapper {
    background-color: #e0e0e0;
    border: 3px outset #fcfcfc;
    overflow: visible;
  }

  .minesweeper-board {
    border: 3px inset #808080;
    display: block;
    width: max-content;
    margin: 0 auto;
    position: relative;
    overflow: visible;
    touch-action: pan-x pan-y pinch-zoom;
  }
  .grid-container {
    --cell-size: 32px;
    display: grid;
    grid-template-columns: repeat(var(--cols), var(--cell-size));
    grid-auto-rows: var(--cell-size);
    width: max-content;
    background: #808080;
    gap: 1px;
    border-top: 1px solid #808080;
    border-left: 1px solid #808080;
  }
  .grid-cell {
    width: var(--cell-size);
    height: var(--cell-size);
    min-width: var(--cell-size);
    min-height: var(--cell-size);
    flex-shrink: 0;
    box-sizing: border-box;
    touch-action: pan-x pan-y pinch-zoom;
    -webkit-tap-highlight-color: transparent;
    padding: 0;
    margin: 0;
    border: 3px outset #eeeeee;
    background-color: #c0c0c0;
    display: flex;
    justify-content: center;
    align-items: center;
    font-weight: 900;
    font-family: Arial, sans-serif;
    font-size: 18px;
    cursor: default;
    line-height: 1;
    color: transparent;
  }
  .grid-cell:focus {
    outline: none;
  }
  .grid-cell:active:not(.revealed) {
    border: 1px solid #999;
    background-color: #c0c0c0;
  }

  .grid-cell.revealed {
    border: 1px solid #808080;
    border-right-color: #eee;
    border-bottom-color: #eee;
    background-color: #c0c0c0;
    cursor: default;
    color: inherit;
  }
  .grid-cell.flagged {
    color: #000;
  }

  .grid-cell.mine {
    background-color: #c0c0c0;
  }

  .grid-cell.exploded {
    background-color: red !important;
  }

  .grid-cell.wrong-flag {
    background-color: #ffaaaa;
  }

  .face-btn {
    font-size: 1.8rem;
    line-height: 1;
    background: #c0c0c0;
    border: 3px outset #eeeeee;
    padding: 2px 6px !important;
    border-radius: 0;
  }
  .face-btn:active {
    border: 3px inset #dddddd;
  }

  /* 옛날 7세그먼트 LED 느낌 폰트를 못 넣으니 monospace 적용 + 효과 */
  .digital-font {
    background: #000;
    padding: 4px;
    border-radius: 4px;
    letter-spacing: 2px;
  }

  .c1 {
    color: #0000ff;
  } /* 파랑 */
  .c2 {
    color: #008000;
  } /* 초록 */
  .c3 {
    color: #ff0000;
  } /* 빨강 */
  .c4 {
    color: #000080;
  } /* 진파랑 */
  .c5 {
    color: #800000;
  } /* 진빨강 */
  .c6 {
    color: #008080;
  } /* 청록 */
  .c7 {
    color: #000000;
  } /* 검정 */
  .c8 {
    color: #808080;
  } /* 회색 */

  .grid-cell.neighbor-highlight {
    background-color: #e8e8e8 !important;
    filter: brightness(1.1);
    box-shadow: inset 0 0 5px rgba(255, 255, 255, 0.5);
  }

  .grid-cell.neighbor-highlight:not(.revealed) {
    border-color: #fff #bbb #bbb #fff;
  }

  .instructions-overlay {
    position: fixed;
    inset: 0;
    z-index: 1050;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: max(0.75rem, env(safe-area-inset-top, 0px))
      max(0.75rem, env(safe-area-inset-right, 0px)) max(0.75rem, env(safe-area-inset-bottom, 0px))
      max(0.75rem, env(safe-area-inset-left, 0px));
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(4px);
    overflow: hidden;
    touch-action: pan-y;
  }

  .instructions-overlay-panel {
    width: min(500px, 100%);
    max-height: min(92dvh, 100%);
    display: flex;
    flex-direction: column;
    margin: auto;
  }

  .instructions-overlay-body {
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    min-height: 0;
  }

  .instructions-overlay-footer {
    flex-shrink: 0;
  }

  .pause-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(8px);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10;
    cursor: pointer;
    border-radius: inherit;
  }
</style>

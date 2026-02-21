<script>
  import { onMount, tick } from 'svelte';
  import { beforeNavigate } from '$app/navigation';
  import Swal from 'sweetalert2';
  let { data } = $props();

  let mode = $state(null);
  let rows = $state(9);
  let cols = $state(9);
  let totalMines = $state(10);
  let showHelp = $state(true);
  let highlightCenter = $state(null);

  let grid = $state([]);
  let gameOver = $state(false);
  let gameWon = $state(false);
  let firstClick = $state(true);
  let flagsPlaced = $state(0);
  let useFlagMode = $state(false);

  let explodedMine = $state(null);

  let timer = $state(0);
  let timerInterval = null;
  let isPaused = $state(false);

  const STORAGE_KEY = 'minesweeper_save';

  let rankList = $state([]);
  let myBestTime = $state(null);
  let todayStats = $state(data.todayStats || { games: 0, users: 0 });
  let rankLoading = $state(false);

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
        myBestTime = j.myBest != null ? Number(j.myBest) : null;
        if (j.todayStats) todayStats = j.todayStats;
      }
    } catch {
      rankList = [];
      myBestTime = null;
    } finally {
      rankLoading = false;
    }
  }

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

  async function confirmModeChange(newMode) {
    if (mode === newMode) return;
    if (!gameOver && !firstClick) {
      const result = await Swal.fire({
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

    const newGrid = [];
    for (let r = 0; r < rows; r++) {
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
      const result = await Swal.fire({
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

  function toggleFlag(e, r, c) {
    e.preventDefault();
    if (gameOver || gameWon || grid[r][c].isRevealed) return;

    grid[r][c].isFlagged = !grid[r][c].isFlagged;
    flagsPlaced += grid[r][c].isFlagged ? 1 : -1;
    grid = [...grid];
    checkWinCondition();
  }

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
</script>

<svelte:head>
  <title>지뢰찾기 | dgst.me</title>
</svelte:head>

<div class="container py-4 position-relative">
  <!-- 도움말 오버레이 -->
  {#if showHelp}
    <div class="instructions-overlay">
      <div
        class="card shadow-lg border-0 rounded-4 overflow-hidden"
        style="max-width: 500px; width: 90%;"
      >
        <div class="card-header bg-primary text-white text-center py-3">
          <h5 class="mb-0">지뢰찾기 가이드 💣</h5>
        </div>
        <div class="card-body p-4">
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
              <li>🚩 <strong>깃발 모드:</strong> 상단 스위치를 켜고 터치해서 깃발 꽂기</li>
            </ul>
          </div>
          <div class="alert alert-info small mb-4 py-2">
            💡 <strong>팁:</strong> 첫 클릭은 항상 안전합니다! 게임 중 상단의
            <strong>🙂 스마일 버튼</strong>을 누르면 언제든 다시 시작할 수 있습니다.
          </div>
          <button class="btn btn-primary w-100 py-2 fw-bold" onclick={() => (showHelp = false)}>
            알겠어요! 게임 시작하기
          </button>
        </div>
      </div>
    </div>
  {/if}

  <div class="row justify-content-center">
    <!-- 게임 보드 영역 -->
    <div class="col-12 col-md-8 col-lg-auto text-center">
      <div class="card shadow rounded-4 mb-3 d-inline-flex">
        <div class="card-body">
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
              class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2 text-start px-2 px-md-0"
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

            <div class="minesweeper-wrapper d-inline-block rounded p-3">
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
                style="touch-action: none;"
              >
                <div class="grid-container" style="--cols: {cols};">
                  {#each grid as row}
                    {#each row as cell}
                      <button
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
                        oncontextmenu={(e) => toggleFlag(e, cell.row, cell.col)}
                        onmouseenter={() => setHighlight(cell.row, cell.col)}
                        onmouseleave={clearHighlight}
                        onclick={(e) => {
                          if (isPaused) return;
                          if (cell.isRevealed) {
                            handleChord(cell.row, cell.col);
                            setHighlight(cell.row, cell.col);
                          } else if (useFlagMode) {
                            toggleFlag(e, cell.row, cell.col);
                          } else {
                            clearHighlight();
                            revealCell(cell.row, cell.col);
                          }
                        }}
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
                      </button>
                    {/each}
                  {/each}
                </div>

                {#if isPaused}
                  <div class="pause-overlay" onclick={togglePause}>
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

    <!-- 랭킹 영역 -->
    {#if mode != null}
      <div class="col-12 col-md-4 mt-3 mt-md-0" style="min-width: 300px;">
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
                <a href="/login" class="btn btn-sm btn-outline-primary">로그인</a>
              {/if}
            </div>
            <p class="small text-muted mb-1">3일 내 1인 1최단기록</p>
            <p class="small text-muted mb-3">
              오늘 해당 게임 완료 <strong>{todayStats.games}</strong>회
            </p>

            {#if isLoggedIn}
              {#if myBestTime != null}
                <div class="alert alert-info py-2 px-3 mb-3 small">
                  내 최고 기록: <strong>{myBestTime}</strong>초
                </div>
              {/if}
              {#if rankList.length > 0}
                <ol class="list-group list-group-numbered">
                  {#each rankList as r}
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                      <span>{r.nickname}</span>
                      <span class="fw-bold font-monospace text-danger">{r.time}초</span>
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
  </div>
</div>

<style>
  .minesweeper-wrapper {
    background-color: #e0e0e0;
    border: 3px outset #fcfcfc;
    max-width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .minesweeper-board {
    border: 3px inset #808080;
    display: table; /* 컨텐츠 크기에 딱 맞게 조절 */
    margin: 0 auto;
  }
  .grid-container {
    display: grid;
    grid-template-columns: repeat(var(--cols), 1fr);
    background: #808080;
    gap: 1px;
    border-top: 1px solid #808080;
    border-left: 1px solid #808080;
  }
  .grid-cell {
    width: 32px;
    height: 32px;
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

  /* 반응형: 모바일에서 터치가 원활하도록 칸 크기 유지 및 최적화 */
  @media (max-width: 768px) {
    .grid-cell {
      width: 32px; /* 모바일에서도 가급적 32px 유지 */
      height: 32px;
      font-size: 18px;
    }
  }

  @media (max-width: 576px) {
    .grid-cell {
      width: 30px; /* 아주 좁은 화면에서만 살짝 줄임 */
      height: 30px;
      font-size: 16px;
      border-width: 2px;
    }
    .minesweeper-wrapper {
      padding: 8px !important;
    }
  }

  @media (max-width: 360px) {
    .grid-cell {
      width: 28px;
      height: 28px;
      font-size: 14px;
    }
  }

  .instructions-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(4px);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1050;
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

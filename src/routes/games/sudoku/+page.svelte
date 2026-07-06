<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { ko } from 'date-fns/locale';
  import { formatRelativeTime } from '$lib/util/formatRelativeTime.js';
  import type { PageData } from './$types';

  const SIZE = 9;
  const BOX = 3;
  const STORAGE_KEY = 'dgst_sudoku_state';
  const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const DIFFICULTIES = {
    easy: { label: '쉬움', clues: 42 },
    normal: { label: '보통', clues: 34 },
    hard: { label: '어려움', clues: 28 }
  } as const;

  type Difficulty = keyof typeof DIFFICULTIES;
  type Grid = number[][];
  type CellPoint = { row: number; col: number };
  type SudokuRank = {
    _id?: string;
    nickname: string;
    difficulty: Difficulty;
    seconds: number;
    mistakes: number;
    createdAt?: string;
  };

  let { data }: { data: PageData } = $props();

  let difficulty = $state<Difficulty>('normal');
  let puzzle = $state<Grid>(emptyGrid());
  let solution = $state<Grid>(emptyGrid());
  let userGrid = $state<Grid>(emptyGrid());
  let notesGrid = $state<Grid>(emptyGrid());
  let selected = $state<CellPoint>({ row: 0, col: 0 });
  let noteMode = $state(false);
  let mistakes = $state(0);
  let elapsed = $state(0);
  let gameWon = $state(false);
  let started = $state(false);
  let submittedWin = $state(false);
  let rankList = $state<SudokuRank[]>([]);
  let myBest = $state<{ seconds: number; mistakes: number; createdAt?: string } | null>(null);
  let rankLoading = $state(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  const isLoggedIn = $derived(!!data.session?.user?.email);
  const selectedValue = $derived(userGrid[selected.row]?.[selected.col] ?? 0);
  const isComplete = $derived(
    userGrid.every((row, rowIndex) =>
      row.every((value, colIndex) => value !== 0 && value === solution[rowIndex][colIndex])
    )
  );

  $effect(() => {
    if (isComplete && started && !gameWon) {
      gameWon = true;
      stopTimer();
      if (!submittedWin) void submitWinScore();
      saveState();
    }
  });

  $effect(() => {
    if (started) saveState();
  });

  $effect(() => {
    if (isLoggedIn) void loadRank();
  });

  onMount(() => {
    if (!restoreState()) resetGame(difficulty, false);
    return () => stopTimer();
  });

  function emptyGrid(): Grid {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  }

  function cloneGrid(grid: Grid): Grid {
    return grid.map((row) => row.slice());
  }

  function shuffle<T>(values: T[]): T[] {
    const next = values.slice();
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
  }

  function pattern(row: number, col: number): number {
    return (BOX * (row % BOX) + Math.floor(row / BOX) + col) % SIZE;
  }

  function generateSolution(): Grid {
    const rows = shuffle([0, 1, 2]).flatMap((band) =>
      shuffle([0, 1, 2]).map((row) => band * BOX + row)
    );
    const cols = shuffle([0, 1, 2]).flatMap((stack) =>
      shuffle([0, 1, 2]).map((col) => stack * BOX + col)
    );
    const nums = shuffle(DIGITS);

    return rows.map((row) => cols.map((col) => nums[pattern(row, col)]));
  }

  function generatePuzzle(fullSolution: Grid, clues: number): Grid {
    const next = cloneGrid(fullSolution);
    const positions = shuffle(
      Array.from({ length: SIZE * SIZE }, (_, index) => ({
        row: Math.floor(index / SIZE),
        col: index % SIZE
      }))
    );
    let remainingClues = SIZE * SIZE;

    for (const { row, col } of positions) {
      if (remainingClues <= clues) break;
      const previous = next[row][col];
      next[row][col] = 0;
      if (countSolutions(cloneGrid(next), 2) !== 1) {
        next[row][col] = previous;
      } else {
        remainingClues -= 1;
      }
    }

    return next;
  }

  function countSolutions(grid: Grid, limit: number): number {
    const spot = findBestEmpty(grid);
    if (!spot) return 1;

    let count = 0;
    for (const value of candidatesFor(grid, spot.row, spot.col)) {
      grid[spot.row][spot.col] = value;
      count += countSolutions(grid, limit);
      grid[spot.row][spot.col] = 0;
      if (count >= limit) return count;
    }
    return count;
  }

  function findBestEmpty(grid: Grid): CellPoint | null {
    let best: CellPoint | null = null;
    let bestCandidates = 10;
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        if (grid[row][col] !== 0) continue;
        const count = candidatesFor(grid, row, col).length;
        if (count < bestCandidates) {
          best = { row, col };
          bestCandidates = count;
          if (count === 1) return best;
        }
      }
    }
    return best;
  }

  function candidatesFor(grid: Grid, row: number, col: number): number[] {
    if (grid[row][col] !== 0) return [];
    return DIGITS.filter((value) => canPlace(grid, row, col, value));
  }

  function canPlace(grid: Grid, row: number, col: number, value: number): boolean {
    for (let i = 0; i < SIZE; i++) {
      if (grid[row][i] === value || grid[i][col] === value) return false;
    }
    const startRow = Math.floor(row / BOX) * BOX;
    const startCol = Math.floor(col / BOX) * BOX;
    for (let r = startRow; r < startRow + BOX; r++) {
      for (let c = startCol; c < startCol + BOX; c++) {
        if (grid[r][c] === value) return false;
      }
    }
    return true;
  }

  function resetGame(
    nextDifficulty: Difficulty = difficulty,
    confirmReset = true,
    reason: 'reset' | 'difficulty' = 'reset'
  ) {
    if (confirmReset && browser) {
      const message =
        reason === 'difficulty' && started && !gameWon
          ? '게임을 중지하고 난이도를 변경하시겠습니까?'
          : '게임을 새로 시작하시겠습니까?';
      if (!window.confirm(message)) return;
    }

    stopTimer();
    difficulty = nextDifficulty;
    const nextSolution = generateSolution();
    solution = nextSolution;
    puzzle = generatePuzzle(nextSolution, DIFFICULTIES[nextDifficulty].clues);
    userGrid = cloneGrid(puzzle);
    notesGrid = emptyGrid();
    selected = firstOpenCell(puzzle);
    noteMode = false;
    mistakes = 0;
    elapsed = 0;
    gameWon = false;
    submittedWin = false;
    started = false;
    saveState();
    if (isLoggedIn) void loadRank();
  }

  function startGame() {
    if (started || gameWon) return;
    started = true;
    startTimer();
    saveState();
  }

  function firstOpenCell(grid: Grid): CellPoint {
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        if (grid[row][col] === 0) return { row, col };
      }
    }
    return { row: 0, col: 0 };
  }

  function startTimer() {
    stopTimer();
    timer = setInterval(() => {
      if (!gameWon) elapsed += 1;
    }, 1000);
  }

  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function saveState() {
    if (!browser) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        difficulty,
        puzzle,
        solution,
        userGrid,
        notesGrid,
        selected,
        noteMode,
        mistakes,
        elapsed,
        gameWon,
        submittedWin,
        started
      })
    );
  }

  function restoreState(): boolean {
    if (!browser) return false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const saved = JSON.parse(raw);
      if (
        !isValidGrid(saved.puzzle) ||
        !isValidGrid(saved.solution) ||
        !isValidGrid(saved.userGrid)
      ) {
        return false;
      }
      difficulty = saved.difficulty in DIFFICULTIES ? saved.difficulty : 'normal';
      puzzle = saved.puzzle;
      solution = saved.solution;
      userGrid = saved.userGrid;
      notesGrid = isValidGrid(saved.notesGrid) ? saved.notesGrid : emptyGrid();
      selected = saved.selected ?? firstOpenCell(saved.puzzle);
      noteMode = Boolean(saved.noteMode);
      mistakes = Number(saved.mistakes ?? 0);
      elapsed = Number(saved.elapsed ?? 0);
      gameWon = Boolean(saved.gameWon);
      submittedWin = Boolean(saved.submittedWin);
      started = Boolean(saved.started);
      if (started && !gameWon) startTimer();
      return true;
    } catch {
      return false;
    }
  }

  function isValidGrid(grid: unknown): grid is Grid {
    return (
      Array.isArray(grid) &&
      grid.length === SIZE &&
      grid.every(
        (row) =>
          Array.isArray(row) &&
          row.length === SIZE &&
          row.every((value) => typeof value === 'number')
      )
    );
  }

  function isFixed(row: number, col: number): boolean {
    return puzzle[row][col] !== 0;
  }

  function isRelated(row: number, col: number): boolean {
    return (
      row === selected.row ||
      col === selected.col ||
      (Math.floor(row / BOX) === Math.floor(selected.row / BOX) &&
        Math.floor(col / BOX) === Math.floor(selected.col / BOX))
    );
  }

  function isWrong(row: number, col: number): boolean {
    const value = userGrid[row][col];
    return value !== 0 && value !== solution[row][col];
  }

  function selectCell(row: number, col: number) {
    selected = { row, col };
  }

  function placeValue(value: number) {
    const { row, col } = selected;
    if (!started || gameWon || isFixed(row, col)) return;

    if (noteMode) {
      const bit = 1 << value;
      const nextNotes = cloneGrid(notesGrid);
      nextNotes[row][col] =
        nextNotes[row][col] & bit ? nextNotes[row][col] & ~bit : nextNotes[row][col] | bit;
      notesGrid = nextNotes;
      return;
    }

    const next = cloneGrid(userGrid);
    next[row][col] = value;
    userGrid = next;
    clearPeerNotes(row, col, value);
    if (value !== solution[row][col]) mistakes += 1;
  }

  function clearCell() {
    const { row, col } = selected;
    if (!started || gameWon || isFixed(row, col)) return;
    const next = cloneGrid(userGrid);
    next[row][col] = 0;
    userGrid = next;
    const nextNotes = cloneGrid(notesGrid);
    nextNotes[row][col] = 0;
    notesGrid = nextNotes;
  }

  function toggleNoteMode(event: MouseEvent) {
    if (!started || gameWon) return;
    noteMode = !noteMode;
    (event.currentTarget as HTMLButtonElement).blur();
  }

  function clearPeerNotes(row: number, col: number, value: number) {
    const bit = 1 << value;
    const next = cloneGrid(notesGrid);
    for (let i = 0; i < SIZE; i++) {
      next[row][i] &= ~bit;
      next[i][col] &= ~bit;
    }
    const startRow = Math.floor(row / BOX) * BOX;
    const startCol = Math.floor(col / BOX) * BOX;
    for (let r = startRow; r < startRow + BOX; r++) {
      for (let c = startCol; c < startCol + BOX; c++) {
        next[r][c] &= ~bit;
      }
    }
    notesGrid = next;
  }

  function hint() {
    const { row, col } = selected;
    if (!started || gameWon || isFixed(row, col)) return;
    const next = cloneGrid(userGrid);
    next[row][col] = solution[row][col];
    userGrid = next;
    clearPeerNotes(row, col, solution[row][col]);
  }

  async function loadRank() {
    rankLoading = true;
    try {
      const res = await fetch(`/games/sudoku?rank=1&difficulty=${difficulty}&_=${Date.now()}`, {
        cache: 'no-store'
      });
      if (!res.ok) return;
      const body = await res.json();
      rankList = body.rank ?? [];
      myBest = body.myBest ?? null;
    } catch {
      rankList = [];
      myBest = null;
    } finally {
      rankLoading = false;
    }
  }

  async function submitWinScore() {
    submittedWin = true;
    saveState();
    if (!isLoggedIn) return;

    try {
      const res = await fetch('/games/sudoku', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ difficulty, seconds: Math.max(1, elapsed), mistakes })
      });
      if (res.ok) await loadRank();
    } catch (error) {
      console.error('[sudoku score submit failed]', error);
    }
  }

  function formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  }

  function formatRecord(seconds: number, mistakes: number): string {
    return `${formatTime(seconds)} · 실수 ${mistakes}`;
  }

  function handleKeydown(event: KeyboardEvent) {
    const keyMap = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1]
    } as const;
    if (event.key in keyMap) {
      event.preventDefault();
      const [dr, dc] = keyMap[event.key as keyof typeof keyMap];
      selected = {
        row: Math.max(0, Math.min(SIZE - 1, selected.row + dr)),
        col: Math.max(0, Math.min(SIZE - 1, selected.col + dc))
      };
      return;
    }
    if (/^[1-9]$/.test(event.key)) {
      event.preventDefault();
      placeValue(Number(event.key));
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') {
      event.preventDefault();
      clearCell();
    }
  }

  function cellNotes(mask: number): Array<number | ''> {
    return DIGITS.map((value) => ((mask & (1 << value)) !== 0 ? value : ''));
  }

  function difficultyEntries(): Array<[Difficulty, (typeof DIFFICULTIES)[Difficulty]]> {
    return Object.entries(DIFFICULTIES) as Array<[Difficulty, (typeof DIFFICULTIES)[Difficulty]]>;
  }
</script>

<svelte:head>
  <title>수도쿠 | dgst.me</title>
</svelte:head>

<div class="sudoku-page container py-4" aria-label="수도쿠 게임">
  <div class="sudoku-shell">
    <section class="sudoku-main" aria-label="수도쿠 보드">
      <div class="sudoku-toolbar">
        <div>
          <h1 class="h3 fw-bold mb-1">수도쿠</h1>
          <p class="text-body-secondary mb-0">빈 칸을 1부터 9까지 채우세요.</p>
        </div>
        <div class="sudoku-stats" aria-label="게임 상태">
          <span>{DIFFICULTIES[difficulty].label}</span>
          <span>{formatTime(elapsed)}</span>
          <span>실수 {mistakes}</span>
        </div>
      </div>

      <div class="sudoku-board-wrap">
        <div
          class="sudoku-board"
          aria-label="수도쿠 9x9 보드"
          class:sudoku-board-paused={!started && !gameWon}
        >
          {#each userGrid as row, rowIndex}
            {#each row as value, colIndex}
              <button
                type="button"
                class="sudoku-cell"
                class:sudoku-cell-fixed={isFixed(rowIndex, colIndex)}
                class:sudoku-cell-selected={selected.row === rowIndex && selected.col === colIndex}
                class:sudoku-cell-related={isRelated(rowIndex, colIndex)}
                class:sudoku-cell-same={value !== 0 && value === selectedValue}
                class:sudoku-cell-wrong={isWrong(rowIndex, colIndex)}
                aria-label="{rowIndex + 1}행 {colIndex + 1}열 {value || '빈칸'}"
                onclick={() => selectCell(rowIndex, colIndex)}
                onkeydown={handleKeydown}
              >
                {#if value}
                  {value}
                {:else if notesGrid[rowIndex][colIndex]}
                  <span class="sudoku-notes">
                    {#each cellNotes(notesGrid[rowIndex][colIndex]) as note}
                      <span>{note}</span>
                    {/each}
                  </span>
                {/if}
              </button>
            {/each}
          {/each}
        </div>

        {#if !started && !gameWon}
          <div class="sudoku-start-layer" role="presentation">
            <button type="button" class="btn btn-primary sudoku-start-button" onclick={startGame}>
              시작
            </button>
          </div>
        {/if}
      </div>

      {#if gameWon}
        <div class="alert alert-success mt-3 mb-0 fw-semibold" role="status">
          완료! 기록 {formatRecord(elapsed, mistakes)}
        </div>
      {/if}

      <section class="sudoku-rank sudoku-rank-board" aria-label="수도쿠 랭킹">
        <div class="sudoku-rank-header">
          <h2 class="h6 fw-bold mb-0">랭킹</h2>
          <span>{DIFFICULTIES[difficulty].label}</span>
        </div>

        {#if !isLoggedIn}
          <p class="text-body-secondary small mb-0">로그인하면 완료 기록이 저장됩니다.</p>
        {:else if rankLoading}
          <p class="text-body-secondary small mb-0">불러오는 중...</p>
        {:else}
          {#if myBest}
            <p class="sudoku-my-best mb-2">
              내 최고 <strong>{formatRecord(myBest.seconds, myBest.mistakes)}</strong>
            </p>
          {/if}

          {#if rankList.length}
            <ol class="sudoku-rank-list">
              {#each rankList as row, index}
                <li>
                  <span class="sudoku-rank-place">{index + 1}</span>
                  <span class="sudoku-rank-name">{row.nickname}</span>
                  <span class="sudoku-rank-score">{formatRecord(row.seconds, row.mistakes)}</span>
                  {#if row.createdAt}
                    <span class="sudoku-rank-date">
                      {formatRelativeTime(row.createdAt, { locale: ko, addSuffix: true })}
                    </span>
                  {/if}
                </li>
              {/each}
            </ol>
          {:else}
            <p class="text-body-secondary small mb-0">아직 기록이 없습니다.</p>
          {/if}
        {/if}
      </section>
    </section>

    <aside class="sudoku-panel" aria-label="수도쿠 조작">
      <div class="sudoku-difficulty" aria-label="난이도 선택">
        {#each difficultyEntries() as [key, config]}
          <button
            type="button"
            class="btn btn-outline-primary"
            class:active={difficulty === key}
            onclick={() => resetGame(key, true, 'difficulty')}
          >
            {config.label}
          </button>
        {/each}
      </div>

      <div class="sudoku-actions">
        <button type="button" class="btn btn-outline-danger" onclick={() => resetGame(difficulty)}>
          초기화
        </button>
        <button
          type="button"
          class="btn btn-outline-secondary sudoku-note-toggle"
          class:active={noteMode}
          class:sudoku-note-toggle-active={noteMode}
          aria-pressed={noteMode}
          onclick={toggleNoteMode}
          disabled={!started || gameWon}
        >
          메모
        </button>
        <button
          type="button"
          class="btn btn-outline-secondary"
          onclick={clearCell}
          disabled={!started || gameWon}
        >
          지우기
        </button>
        <button
          type="button"
          class="btn btn-outline-success"
          onclick={hint}
          disabled={!started || gameWon}
        >
          힌트
        </button>
      </div>

      <div class="sudoku-pad" aria-label="숫자 입력">
        {#each DIGITS as value}
          <button
            type="button"
            class="btn btn-light"
            onclick={() => placeValue(value)}
            disabled={!started || gameWon}
          >
            {value}
          </button>
        {/each}
      </div>

      <section class="sudoku-rank" aria-label="수도쿠 랭킹">
        <div class="sudoku-rank-header">
          <h2 class="h6 fw-bold mb-0">랭킹</h2>
          <span>{DIFFICULTIES[difficulty].label}</span>
        </div>

        {#if !isLoggedIn}
          <p class="text-body-secondary small mb-0">로그인하면 완료 기록이 저장됩니다.</p>
        {:else if rankLoading}
          <p class="text-body-secondary small mb-0">불러오는 중...</p>
        {:else}
          {#if myBest}
            <p class="sudoku-my-best mb-2">
              내 최고 <strong>{formatRecord(myBest.seconds, myBest.mistakes)}</strong>
            </p>
          {/if}

          {#if rankList.length}
            <ol class="sudoku-rank-list">
              {#each rankList as row, index}
                <li>
                  <span class="sudoku-rank-place">{index + 1}</span>
                  <span class="sudoku-rank-name">{row.nickname}</span>
                  <span class="sudoku-rank-score">{formatRecord(row.seconds, row.mistakes)}</span>
                  {#if row.createdAt}
                    <span class="sudoku-rank-date">
                      {formatRelativeTime(row.createdAt, { locale: ko, addSuffix: true })}
                    </span>
                  {/if}
                </li>
              {/each}
            </ol>
          {:else}
            <p class="text-body-secondary small mb-0">아직 기록이 없습니다.</p>
          {/if}
        {/if}
      </section>
    </aside>
  </div>
</div>

<style>
  .sudoku-page {
    max-width: 1120px;
  }

  .sudoku-shell {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(240px, 300px);
    gap: 1rem;
    align-items: start;
  }

  .sudoku-main,
  .sudoku-panel {
    border: 1px solid var(--bs-border-color);
    border-radius: 0.5rem;
    background: var(--bs-body-bg);
    box-shadow: 0 0.5rem 1.25rem rgba(0, 0, 0, 0.08);
  }

  .sudoku-main {
    padding: 1rem;
    overflow-x: auto;
  }

  .sudoku-toolbar {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: end;
    margin-bottom: 1rem;
  }

  .sudoku-stats {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .sudoku-stats span {
    border: 1px solid var(--bs-border-color);
    border-radius: 999px;
    padding: 0.35rem 0.65rem;
    font-weight: 700;
    background: var(--bs-tertiary-bg);
    white-space: nowrap;
  }

  .sudoku-board-wrap {
    position: relative;
    width: min(100%, 620px);
    aspect-ratio: 1;
    margin-inline: auto;
  }

  .sudoku-board {
    width: 100%;
    height: 100%;
    aspect-ratio: 1;
    display: grid;
    grid-template-columns: repeat(9, minmax(0, 1fr));
    border: 3px solid var(--bs-emphasis-color);
    background: var(--bs-emphasis-color);
    user-select: none;
    box-sizing: border-box;
  }

  .sudoku-board-paused {
    filter: blur(1px);
    opacity: 0.72;
  }

  .sudoku-start-layer {
    position: absolute;
    inset: 0;
    z-index: 3;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.28);
  }

  .sudoku-start-button {
    min-width: 8rem;
    min-height: 3rem;
    font-size: 1.1rem;
    font-weight: 800;
    box-shadow: 0 0.75rem 1.6rem rgba(0, 0, 0, 0.28);
  }

  .sudoku-cell {
    position: relative;
    aspect-ratio: 1;
    min-width: 0;
    min-height: 0;
    border: 1px solid var(--bs-border-color);
    background: var(--bs-body-bg);
    color: var(--bs-primary);
    font-size: clamp(1.1rem, 4.2vw, 2.1rem);
    font-weight: 700;
    line-height: 1;
    display: grid;
    place-items: center;
    padding: 0;
    touch-action: manipulation;
  }

  .sudoku-cell:nth-child(3n) {
    border-right: 3px solid var(--bs-emphasis-color);
  }

  .sudoku-cell:nth-child(9n) {
    border-right: 0;
  }

  .sudoku-cell:nth-child(n + 19):nth-child(-n + 27),
  .sudoku-cell:nth-child(n + 46):nth-child(-n + 54) {
    border-bottom: 3px solid var(--bs-emphasis-color);
  }

  .sudoku-cell-fixed {
    color: var(--bs-body-color);
    background: var(--bs-tertiary-bg);
  }

  .sudoku-cell-related {
    background: color-mix(in srgb, var(--bs-primary-bg-subtle) 70%, var(--bs-body-bg));
  }

  .sudoku-cell-same {
    background: var(--bs-info-bg-subtle);
  }

  .sudoku-cell-selected {
    outline: 3px solid var(--bs-primary);
    outline-offset: -3px;
    z-index: 1;
  }

  .sudoku-cell-wrong {
    color: var(--bs-danger);
    background: var(--bs-danger-bg-subtle);
  }

  .sudoku-notes {
    width: 82%;
    height: 82%;
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-rows: repeat(3, minmax(0, 1fr));
    color: var(--bs-secondary-color);
    font-size: clamp(0.45rem, 1.5vw, 0.78rem);
    font-weight: 700;
    align-items: center;
    line-height: 1;
  }

  .sudoku-notes span {
    min-width: 0;
    text-align: center;
  }

  .sudoku-panel {
    padding: 1rem;
    display: grid;
    gap: 1rem;
  }

  .sudoku-difficulty,
  .sudoku-actions,
  .sudoku-pad {
    display: grid;
    gap: 0.5rem;
  }

  .sudoku-difficulty {
    grid-template-columns: repeat(3, 1fr);
  }

  .sudoku-actions {
    grid-template-columns: repeat(2, 1fr);
  }

  .sudoku-note-toggle {
    border-color: var(--bs-secondary);
    background: var(--bs-body-bg);
    color: var(--bs-secondary);
  }

  .sudoku-note-toggle:hover,
  .sudoku-note-toggle:focus-visible {
    border-color: var(--bs-secondary);
    background: var(--bs-tertiary-bg);
    color: var(--bs-secondary);
  }

  .sudoku-note-toggle-active,
  .sudoku-note-toggle-active:hover,
  .sudoku-note-toggle-active:focus-visible {
    border-color: var(--bs-primary);
    background: var(--bs-primary);
    color: var(--bs-white);
  }

  .sudoku-pad {
    grid-template-columns: repeat(3, 1fr);
  }

  .sudoku-pad .btn {
    aspect-ratio: 1;
    font-size: 1.5rem;
    font-weight: 800;
    min-width: 0;
  }

  .sudoku-rank {
    border-top: 1px solid var(--bs-border-color);
    padding-top: 0.25rem;
  }

  .sudoku-rank-board {
    display: none;
  }

  .sudoku-rank-header {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .sudoku-rank-header span,
  .sudoku-my-best {
    color: var(--bs-secondary-color);
    font-size: 0.85rem;
  }

  .sudoku-rank-list {
    display: grid;
    gap: 0.4rem;
    padding: 0;
    margin: 0;
    list-style: none;
  }

  .sudoku-rank-list li {
    display: grid;
    grid-template-columns: 1.5rem minmax(0, 1fr) auto;
    gap: 0.45rem;
    align-items: center;
    padding: 0.4rem 0;
    border-bottom: 1px solid var(--bs-border-color);
  }

  .sudoku-rank-list li:last-child {
    border-bottom: 0;
  }

  .sudoku-rank-place {
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 999px;
    display: grid;
    place-items: center;
    background: var(--bs-tertiary-bg);
    font-size: 0.78rem;
    font-weight: 800;
  }

  .sudoku-rank-name,
  .sudoku-rank-score {
    font-weight: 700;
    min-width: 0;
  }

  .sudoku-rank-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sudoku-rank-score {
    white-space: nowrap;
  }

  .sudoku-rank-date {
    grid-column: 2 / 4;
    color: var(--bs-secondary-color);
    font-size: 0.75rem;
  }

  @media (max-width: 900px) {
    .sudoku-shell {
      grid-template-columns: 1fr;
    }

    .sudoku-panel {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 560px) {
    .sudoku-page {
      width: 100%;
      padding-inline: 0.5rem;
      padding-top: 0.75rem !important;
      padding-bottom: calc(10.5rem + env(safe-area-inset-bottom)) !important;
      overflow-x: auto;
    }

    .sudoku-shell {
      gap: 0.75rem;
    }

    .sudoku-main {
      padding: 0.625rem;
      border-radius: 0.375rem;
      box-shadow: none;
    }

    .sudoku-toolbar {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.5rem;
      align-items: start;
      margin-bottom: 0.625rem;
    }

    .sudoku-toolbar h1 {
      font-size: 1.3rem;
      margin-bottom: 0 !important;
    }

    .sudoku-toolbar p {
      display: none;
    }

    .sudoku-stats {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.375rem;
      width: 100%;
    }

    .sudoku-stats span {
      min-width: 0;
      padding: 0.35rem 0.25rem;
      text-align: center;
      font-size: 0.82rem;
      border-radius: 0.375rem;
    }

    .sudoku-board-wrap {
      width: min(100%, calc(100vw - 1.75rem));
    }

    .sudoku-board {
      border-width: 2px;
    }

    .sudoku-cell {
      font-size: clamp(1rem, 7vw, 1.55rem);
      border-width: 1px;
    }

    .sudoku-cell:nth-child(3n) {
      border-right-width: 2px;
    }

    .sudoku-cell:nth-child(9n) {
      border-right: 0;
    }

    .sudoku-cell:nth-child(n + 19):nth-child(-n + 27),
    .sudoku-cell:nth-child(n + 46):nth-child(-n + 54) {
      border-bottom-width: 2px;
    }

    .sudoku-cell-selected {
      outline-width: 2px;
      outline-offset: -2px;
    }

    .sudoku-notes {
      width: 88%;
      height: 88%;
      font-size: clamp(0.42rem, 2.6vw, 0.62rem);
    }

    .sudoku-panel {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 20;
      gap: 0.45rem;
      padding: 0.55rem 0.6rem calc(0.55rem + env(safe-area-inset-bottom));
      border-right: 0;
      border-bottom: 0;
      border-left: 0;
      border-radius: 0;
      background: color-mix(in srgb, var(--bs-body-bg) 94%, transparent);
      box-shadow: 0 -0.55rem 1.1rem rgba(0, 0, 0, 0.14);
      backdrop-filter: blur(10px);
    }

    .sudoku-panel .sudoku-rank {
      display: none;
    }

    .sudoku-rank-board {
      display: block;
      margin-top: 0.75rem;
      padding-top: 0.75rem;
    }

    .sudoku-difficulty {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.35rem;
    }

    .sudoku-actions {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.35rem;
    }

    .sudoku-difficulty .btn,
    .sudoku-actions .btn {
      min-height: 2.2rem;
      padding-inline: 0.2rem;
      font-size: 0.84rem;
      font-weight: 700;
      white-space: nowrap;
    }

    .sudoku-pad {
      grid-template-columns: repeat(9, minmax(0, 1fr));
      gap: 0.28rem;
    }

    .sudoku-pad .btn {
      width: 100%;
      min-height: 2.5rem;
      aspect-ratio: auto;
      padding: 0;
      font-size: 1.15rem;
      border-radius: 0.375rem;
    }
  }
</style>

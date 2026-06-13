<script lang="ts">
  import { resolve } from '$app/paths';
  import { onMount, tick } from 'svelte';
  import type { PageData } from './$types';

  interface Game2048Props {
    data: PageData;
  }

  let { data }: Game2048Props = $props();

  type GameMode = 'beginner' | 'easy' | 'mid' | 'normal';
  let mode = $state<GameMode | null>(null);
  const SIZE = $derived(mode === 'easy' || mode === 'beginner' ? 5 : 4);
  let grid = $state<number[]>([]);
  let score = $state(0);
  let gameOver = $state(false);
  let rankList = $state<Array<{ nickname: string; score: number; _id?: string }>>([]);
  let myBestScore = $state<number | null>(null);
  let todayStats = $state<{ games: number; users: number }>({ games: 0, users: 0 });
  let loading = $state(false);
  let gridTicked = $state(false);
  let tickTimeout: ReturnType<typeof setTimeout> | null = null;
  let isAnimating = $state(false);
  let spawnedIndex = $state<number | null>(null);
  let spawnTimeout: ReturnType<typeof setTimeout> | null = null;
  let spawnEffectTimeout: ReturnType<typeof setTimeout> | null = null;
  let moveUnlockTimeout: ReturnType<typeof setTimeout> | null = null;
  const MOVE_ANIM_MS = 150;
  const SPAWN_DELAY_MS = 120;
  const SPAWN_BLING_MS = 320;
  /** 쌩초보: 현재 목표 (32 → 64 → 128 …) */
  let beginnerTarget = $state(32);
  /** 쌩초보: 방금 통과한 목표, 잠깐 표시 후 0 */
  let passedFlash = $state(0);
  let passedFlashTimeout: ReturnType<typeof setTimeout> | null = null;
  /** 512 통과 후 쉬운 모드로 전환 시 잠깐 표시 */
  let justSwitchedToEasy = $state(false);
  let switchedToEasyTimeout: ReturnType<typeof setTimeout> | null = null;

  function getEmptyIndices(): number[] {
    return grid.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
  }

  function addRandomTile(): number | null {
    if (grid.length !== SIZE * SIZE) return null;
    const empty = getEmptyIndices();
    if (empty.length === 0) return null;
    const idx = empty[Math.floor(Math.random() * empty.length)];
    grid = grid.slice();
    grid[idx] = Math.random() < 0.9 ? 2 : 4;
    return idx;
  }

  function startGame(m: GameMode) {
    mode = m;
    initGrid();
  }

  function initGrid() {
    if (mode == null) return;
    if (spawnTimeout) clearTimeout(spawnTimeout);
    if (spawnEffectTimeout) clearTimeout(spawnEffectTimeout);
    if (moveUnlockTimeout) clearTimeout(moveUnlockTimeout);
    spawnedIndex = null;
    isAnimating = false;
    grid = Array(SIZE * SIZE).fill(0);
    score = 0;
    gameOver = false;
    if (mode === 'beginner') {
      beginnerTarget = 32;
      passedFlash = 0;
      if (passedFlashTimeout) clearTimeout(passedFlashTimeout);
    }
    addRandomTile();
    addRandomTile();
  }

  function clearGridAndAddTwo() {
    spawnedIndex = null;
    grid = Array(SIZE * SIZE).fill(0);
    addRandomTile();
    addRandomTile();
  }

  function checkBeginnerPass(): boolean {
    if (mode !== 'beginner') return false;
    const maxTile = grid.length ? Math.max(...grid) : 0;
    if (maxTile < beginnerTarget) return false;
    const scoreAtPass = score;
    void submitLevelClearScore(scoreAtPass);
    passedFlash = beginnerTarget;
    if (passedFlashTimeout) clearTimeout(passedFlashTimeout);
    passedFlashTimeout = setTimeout(() => {
      passedFlash = 0;
      passedFlashTimeout = null;
    }, 1500);
    if (beginnerTarget >= 512) {
      if (switchedToEasyTimeout) clearTimeout(switchedToEasyTimeout);
      justSwitchedToEasy = true;
      switchedToEasyTimeout = setTimeout(() => {
        justSwitchedToEasy = false;
        switchedToEasyTimeout = null;
      }, 2500);
      mode = 'easy';
      initGrid();
      return true;
    }
    beginnerTarget *= 2;
    clearGridAndAddTwo();
    return true;
  }

  function at(row: number, col: number): number {
    return grid[row * SIZE + col];
  }

  function setAt(row: number, col: number, val: number) {
    const i = row * SIZE + col;
    grid = grid.slice();
    grid[i] = val;
  }

  /** 한 줄(배열)을 왼쪽으로 밀고 합치기. [2,2,4,0] -> [4,4,0,0], merged score 반환 */
  function mergeLine(line: number[]): { line: number[]; added: number } {
    const len = line.length;
    const filtered = line.filter((x) => x !== 0);
    let added = 0;
    const result: number[] = [];
    let i = 0;
    while (i < filtered.length) {
      if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
        const v = filtered[i] * 2;
        result.push(v);
        added += v;
        i += 2;
      } else {
        result.push(filtered[i]);
        i += 1;
      }
    }
    while (result.length < len) result.push(0);
    return { line: result, added };
  }

  function moveLeft() {
    if (gameOver || mode == null || isAnimating) return;
    let changed = false;
    let added = 0;
    const next = grid.slice();
    for (let row = 0; row < SIZE; row++) {
      const line = Array.from({ length: SIZE }, (_, c) => next[row * SIZE + c]);
      const { line: merged, added: a } = mergeLine(line);
      added += a;
      for (let col = 0; col < SIZE; col++) {
        if (next[row * SIZE + col] !== merged[col]) changed = true;
        next[row * SIZE + col] = merged[col];
      }
    }
    if (changed) {
      isAnimating = true;
      grid = next;
      score += added;
      triggerTileTick();
      const beginnerHandled = checkBeginnerPass();
      if (beginnerHandled) {
        moveUnlockTimeout = setTimeout(() => {
          isAnimating = false;
          moveUnlockTimeout = null;
        }, MOVE_ANIM_MS);
        return;
      }
      spawnTimeout = setTimeout(() => {
        const idx = addRandomTile();
        if (idx != null) {
          spawnedIndex = idx;
          if (spawnEffectTimeout) clearTimeout(spawnEffectTimeout);
          spawnEffectTimeout = setTimeout(() => {
            spawnedIndex = null;
            spawnEffectTimeout = null;
          }, SPAWN_BLING_MS);
        }
        if (getEmptyIndices().length === 0 && !canMove()) {
          gameOver = true;
          if (isLoggedIn) void submitGameOverScore(score);
        }
        isAnimating = false;
        spawnTimeout = null;
      }, SPAWN_DELAY_MS);
    }
  }

  function triggerTileTick() {
    if (tickTimeout) clearTimeout(tickTimeout);
    gridTicked = true;
    tickTimeout = setTimeout(() => {
      gridTicked = false;
      tickTimeout = null;
    }, MOVE_ANIM_MS);
  }

  function moveRight() {
    if (gameOver || mode == null || isAnimating) return;
    let changed = false;
    let added = 0;
    const next = grid.slice();
    for (let row = 0; row < SIZE; row++) {
      const line = Array.from({ length: SIZE }, (_, c) => next[row * SIZE + (SIZE - 1 - c)]);
      const { line: merged, added: a } = mergeLine(line);
      added += a;
      for (let col = 0; col < SIZE; col++) {
        const v = merged[SIZE - 1 - col];
        if (next[row * SIZE + col] !== v) changed = true;
        next[row * SIZE + col] = v;
      }
    }
    if (changed) {
      isAnimating = true;
      grid = next;
      score += added;
      triggerTileTick();
      const beginnerHandled = checkBeginnerPass();
      if (beginnerHandled) {
        moveUnlockTimeout = setTimeout(() => {
          isAnimating = false;
          moveUnlockTimeout = null;
        }, MOVE_ANIM_MS);
        return;
      }
      spawnTimeout = setTimeout(() => {
        const idx = addRandomTile();
        if (idx != null) {
          spawnedIndex = idx;
          if (spawnEffectTimeout) clearTimeout(spawnEffectTimeout);
          spawnEffectTimeout = setTimeout(() => {
            spawnedIndex = null;
            spawnEffectTimeout = null;
          }, SPAWN_BLING_MS);
        }
        if (getEmptyIndices().length === 0 && !canMove()) {
          gameOver = true;
          if (isLoggedIn) void submitGameOverScore(score);
        }
        isAnimating = false;
        spawnTimeout = null;
      }, SPAWN_DELAY_MS);
    }
  }

  function moveUp() {
    if (gameOver || mode == null || isAnimating) return;
    let changed = false;
    let added = 0;
    const next = grid.slice();
    for (let col = 0; col < SIZE; col++) {
      const line = Array.from({ length: SIZE }, (_, r) => next[r * SIZE + col]);
      const { line: merged, added: a } = mergeLine(line);
      added += a;
      for (let row = 0; row < SIZE; row++) {
        if (next[row * SIZE + col] !== merged[row]) changed = true;
        next[row * SIZE + col] = merged[row];
      }
    }
    if (changed) {
      isAnimating = true;
      grid = next;
      score += added;
      triggerTileTick();
      const beginnerHandled = checkBeginnerPass();
      if (beginnerHandled) {
        moveUnlockTimeout = setTimeout(() => {
          isAnimating = false;
          moveUnlockTimeout = null;
        }, MOVE_ANIM_MS);
        return;
      }
      spawnTimeout = setTimeout(() => {
        const idx = addRandomTile();
        if (idx != null) {
          spawnedIndex = idx;
          if (spawnEffectTimeout) clearTimeout(spawnEffectTimeout);
          spawnEffectTimeout = setTimeout(() => {
            spawnedIndex = null;
            spawnEffectTimeout = null;
          }, SPAWN_BLING_MS);
        }
        if (getEmptyIndices().length === 0 && !canMove()) {
          gameOver = true;
          if (isLoggedIn) void submitGameOverScore(score);
        }
        isAnimating = false;
        spawnTimeout = null;
      }, SPAWN_DELAY_MS);
    }
  }

  function moveDown() {
    if (gameOver || mode == null || isAnimating) return;
    let changed = false;
    let added = 0;
    const next = grid.slice();
    for (let col = 0; col < SIZE; col++) {
      const line = Array.from({ length: SIZE }, (_, r) => next[(SIZE - 1 - r) * SIZE + col]);
      const { line: merged, added: a } = mergeLine(line);
      added += a;
      for (let row = 0; row < SIZE; row++) {
        const v = merged[SIZE - 1 - row];
        if (next[row * SIZE + col] !== v) changed = true;
        next[row * SIZE + col] = v;
      }
    }
    if (changed) {
      isAnimating = true;
      grid = next;
      score += added;
      triggerTileTick();
      const beginnerHandled = checkBeginnerPass();
      if (beginnerHandled) {
        moveUnlockTimeout = setTimeout(() => {
          isAnimating = false;
          moveUnlockTimeout = null;
        }, MOVE_ANIM_MS);
        return;
      }
      spawnTimeout = setTimeout(() => {
        const idx = addRandomTile();
        if (idx != null) {
          spawnedIndex = idx;
          if (spawnEffectTimeout) clearTimeout(spawnEffectTimeout);
          spawnEffectTimeout = setTimeout(() => {
            spawnedIndex = null;
            spawnEffectTimeout = null;
          }, SPAWN_BLING_MS);
        }
        if (getEmptyIndices().length === 0 && !canMove()) {
          gameOver = true;
          if (isLoggedIn) void submitGameOverScore(score);
        }
        isAnimating = false;
        spawnTimeout = null;
      }, SPAWN_DELAY_MS);
    }
  }

  function canMove(): boolean {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = at(r, c);
        if (v === 0) return true;
        if (c < SIZE - 1 && at(r, c + 1) === v) return true;
        if (r < SIZE - 1 && at(r + 1, c) === v) return true;
      }
    }
    return false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (gameOver) return;
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        moveLeft();
        break;
      case 'ArrowRight':
        e.preventDefault();
        moveRight();
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveUp();
        break;
      case 'ArrowDown':
        e.preventDefault();
        moveDown();
        break;
    }
  }

  /** 모바일 터치 스와이프: 최소 이동 거리(px) */
  const SWIPE_MIN = 30;
  let touchStart = $state<{ x: number; y: number } | null>(null);

  function handleTouchStart(e: TouchEvent) {
    if (gameOver || !e.touches.length) return;
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }

  function handleTouchEnd(e: TouchEvent) {
    if (!touchStart || gameOver || !e.changedTouches.length) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (adx < SWIPE_MIN && ady < SWIPE_MIN) return;
    if (adx >= ady) {
      if (dx > 0) moveRight();
      else moveLeft();
    } else {
      if (dy > 0) moveDown();
      else moveUp();
    }
  }

  function handleTouchMove(e: Event) {
    const te = e as TouchEvent;
    if (!touchStart || !te.touches.length) return;
    const t = te.touches[0];
    const dx = Math.abs(t.clientX - touchStart.x);
    const dy = Math.abs(t.clientY - touchStart.y);
    if (dx > 10 || dy > 10) e.preventDefault();
  }

  async function loadRank() {
    try {
      const res = await fetch(`/games/2048?rank=1&_=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const j = await res.json();
        rankList = j.rank ?? [];
        myBestScore = j.myBest != null ? Number(j.myBest) : null;
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
      todayStats = { games: 0, users: 0 };
    }
  }

  /** 게임오버 시 자동 호출. 로그인 사용자만 점수 전송 후 랭킹 갱신(버튼 없이) */
  async function submitGameOverScore(finalScore: number) {
    if (!isLoggedIn || finalScore <= 0) return;
    try {
      const res = await fetch('/games/2048', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: finalScore })
      });
      if (res.ok) await loadRank();
    } catch (e) {
      console.error('[2048 게임오버 점수 저장 실패]', e);
    }
  }

  async function submitLevelClearScore(scoreToSave: number) {
    if (!isLoggedIn || scoreToSave <= 0) return;
    try {
      const res = await fetch('/games/2048', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: scoreToSave })
      });
      if (res.ok) await loadRank();
    } catch (e) {
      console.error('[2048 레벨 통과 점수 저장 실패]', e);
    }
  }

  function formatScore(n: number): string {
    return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n);
  }

  const TILE_COLORS: Record<number, string> = {
    0: '#cdc1b4',
    2: '#eee4da',
    4: '#ede0c8',
    8: '#f2b179',
    16: '#f59563',
    32: '#f67c5f',
    64: '#f65e3b',
    128: '#edcf72',
    256: '#edcc61',
    512: '#edc850',
    1024: '#edc53f',
    2048: '#edc22e',
    4096: '#edc22e',
    8192: '#3c3a32'
  };
  function tileBg(n: number): string {
    return TILE_COLORS[n] ?? '#3c3a32';
  }

  function tileFontSize(n: number): string {
    if (n >= 8192) return '0.85rem';
    if (n >= 4096) return '1rem';
    if (n >= 1024) return '1.25rem';
    if (n >= 128) return '1.5rem';
    if (n >= 16) return '1.75rem';
    return '2rem';
  }

  const isLoggedIn = $derived(!!data.session?.user?.email);

  const STORAGE_KEY = 'dgst_2048_state';
  type SavedState = {
    mode: GameMode;
    grid: number[];
    score: number;
    gameOver: boolean;
    beginnerTarget: number;
  };

  function getStateToSave(): SavedState | null {
    if (mode == null) return null;
    return { mode, grid: grid.slice(), score, gameOver, beginnerTarget };
  }

  function saveStateToStorage() {
    const state = getStateToSave();
    if (!state) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('[2048 localStorage 저장 실패]', e);
    }
  }

  function loadStateFromStorage(): SavedState | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') return null;
      const m = (parsed as Record<string, unknown>).mode;
      const modes: GameMode[] = ['beginner', 'easy', 'mid', 'normal'];
      if (!modes.includes(m as GameMode)) return null;
      const mode = m as GameMode;
      const size = mode === 'beginner' || mode === 'easy' ? 5 : 4;
      const len = size * size;
      const g = (parsed as Record<string, unknown>).grid;
      if (!Array.isArray(g) || g.length !== len || g.some((x: unknown) => typeof x !== 'number'))
        return null;
      const score = Number((parsed as Record<string, unknown>).score);
      const gameOver = Boolean((parsed as Record<string, unknown>).gameOver);
      const beginnerTarget = Number((parsed as Record<string, unknown>).beginnerTarget) || 32;
      return {
        mode,
        grid: g as number[],
        score: Number.isFinite(score) ? score : 0,
        gameOver,
        beginnerTarget
      };
    } catch {
      return null;
    }
  }

  function restoreState(saved: SavedState) {
    mode = saved.mode;
    grid = saved.grid.slice();
    score = saved.score;
    gameOver = saved.gameOver;
    beginnerTarget = saved.beginnerTarget;
    passedFlash = 0;
    justSwitchedToEasy = false;
    spawnedIndex = null;
    isAnimating = false;
  }

  /** 이탈 시(탭 닫기/새로고침/다른 페이지 이동) 점수 제출. keepalive로 페이지 종료 후에도 전송 시도 */
  function submitScoreOnLeave(scoreToSubmit: number) {
    if (!isLoggedIn || scoreToSubmit <= 0) return;
    fetch('/games/2048', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score: scoreToSubmit }),
      keepalive: true
    }).catch((e) => console.error('[2048 이탈 시 점수 전송 실패]', e));
  }

  $effect(() => {
    if (isLoggedIn) loadRank();
  });

  let gridEl = $state<HTMLDivElement | null>(null);

  let cleanupTouchMove: (() => void) | null = null;

  onMount(() => {
    const saved = loadStateFromStorage();
    if (saved) restoreState(saved);

    const handleBeforeUnload = () => {
      saveStateToStorage();
      const state = getStateToSave();
      if (state && state.score > 0) submitScoreOnLeave(state.score);
    };

    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      saveStateToStorage();
      const state = getStateToSave();
      if (state && state.score > 0) submitScoreOnLeave(state.score);
      if (tickTimeout) clearTimeout(tickTimeout);
      if (spawnTimeout) clearTimeout(spawnTimeout);
      if (spawnEffectTimeout) clearTimeout(spawnEffectTimeout);
      if (moveUnlockTimeout) clearTimeout(moveUnlockTimeout);
      if (passedFlashTimeout) clearTimeout(passedFlashTimeout);
      if (switchedToEasyTimeout) clearTimeout(switchedToEasyTimeout);
      if (cleanupTouchMove) cleanupTouchMove();
    };
  });

  $effect(() => {
    if (mode == null) return;
    tick().then(() => {
      if (cleanupTouchMove) cleanupTouchMove();
      const el = document.querySelector('.game-2048-grid');
      if (el) {
        el.addEventListener('touchmove', handleTouchMove, { passive: false });
        cleanupTouchMove = () => el.removeEventListener('touchmove', handleTouchMove);
      }
    });
    return () => {
      if (cleanupTouchMove) {
        cleanupTouchMove();
        cleanupTouchMove = null;
      }
    };
  });
</script>

<svelte:head>
  <title>2048 | dgst.me</title>
</svelte:head>

<div class="container py-4">
  <div class="row justify-content-center">
    <div class="col-12 col-md-8 col-lg-6">
      <div class="card shadow rounded-4 mb-3">
        <div class="card-body">
          {#if mode == null}
            <div class="text-center py-4">
              <h4 class="mb-3">2048</h4>
              <p class="text-muted mb-4">모드를 선택하세요</p>
              <div class="d-flex flex-column gap-2">
                <button
                  type="button"
                  class="btn btn-lg btn-outline-success"
                  onclick={() => startGame('beginner')}
                >
                  쌩초보
                </button>
                <p class="small text-muted mb-0">5×5, 2·4 타일. 32 만들면 통과 → 다음 64 → 128…</p>
                <button
                  type="button"
                  class="btn btn-lg btn-outline-primary"
                  onclick={() => startGame('easy')}
                >
                  쉬운
                </button>
                <p class="small text-muted mb-0">5×5, 1024까지</p>
                <button
                  type="button"
                  class="btn btn-lg btn-outline-info"
                  onclick={() => startGame('mid')}
                >
                  다음단계
                </button>
                <p class="small text-muted mb-0">4×4, 1024까지</p>
                <button
                  type="button"
                  class="btn btn-lg btn-outline-secondary"
                  onclick={() => startGame('normal')}
                >
                  보통
                </button>
                <p class="small text-muted mb-0">4×4, 2048까지</p>
              </div>
            </div>
          {:else}
            <div class="d-flex justify-content-between align-items-center mb-3">
              <h4 class="mb-0">
                2048 <span class="badge bg-secondary ms-2"
                  >{mode === 'beginner'
                    ? '쌩초보'
                    : mode === 'easy'
                      ? '쉬운'
                      : mode === 'mid'
                        ? '다음단계'
                        : '보통'}</span
                >
              </h4>
              <div class="d-flex align-items-center gap-2 flex-wrap">
                <span class="fw-bold">현재 점수: {score}</span>
                {#if isLoggedIn}
                  <span class="small text-muted"
                    >3일 내 내 최고: {myBestScore != null ? formatScore(myBestScore) : '—'}</span
                  >
                {/if}
                <span class="small text-muted"
                  >오늘 참여 {todayStats.users}명 · 게임 {todayStats.games}회</span
                >
                <button
                  class="btn btn-sm btn-outline-secondary"
                  onclick={initGrid}
                  disabled={loading}
                >
                  새 게임
                </button>
                <button
                  class="btn btn-sm btn-outline-dark"
                  onclick={() => {
                    try {
                      localStorage.removeItem(STORAGE_KEY);
                    } catch {}
                    mode = null;
                  }}
                  disabled={loading}
                >
                  모드 변경
                </button>
              </div>
            </div>
            {#if mode === 'beginner'}
              <p class="small mb-2">
                <span class="badge bg-success me-2">목표: {beginnerTarget}</span>
                32 → 64 → 128… 순서로 만들면 통과!
              </p>
            {/if}
            <p class="small text-muted mb-3">
              방향키 또는 그리드 위에서 스와이프로 이동. 같은 숫자가 만나면 합쳐집니다. 레벨 통과
              또는 게임오버 시 점수가 랭킹에 기록됩니다. (3일 내 내 최고점)
            </p>
            <div class="text-center">
              <div class="game-2048-grid-wrapper" class:game-2048-grid-5={SIZE === 5}>
                {#if passedFlash > 0}
                  <div class="game-2048-passed-overlay game-2048-passed">
                    <span class="game-2048-passed-text">{passedFlash} 통과!</span>
                  </div>
                {/if}
                {#if justSwitchedToEasy}
                  <div class="game-2048-passed-overlay game-2048-passed">
                    <span class="game-2048-passed-text">512 통과!<br />쉬운 모드로!</span>
                  </div>
                {/if}
                <div
                  class="game-2048-grid rounded-3 p-2 mb-0"
                  bind:this={gridEl}
                  ontouchstart={handleTouchStart}
                  ontouchend={handleTouchEnd}
                  role="application"
                  aria-label="2048 그리드, 스와이프로 이동"
                >
                  {#each Array(SIZE) as _, row (row)}
                    <div class="game-2048-row">
                      {#each Array(SIZE) as _, col (`${row}-${col}`)}
                        <div
                          class="game-2048-tile"
                          class:game-2048-tile-tick={gridTicked}
                          class:game-2048-tile-spawn={spawnedIndex === row * SIZE + col &&
                            at(row, col) !== 0}
                          style="background-color: {tileBg(at(row, col))}; font-size: {tileFontSize(
                            at(row, col)
                          )};"
                        >
                          {at(row, col) === 0 ? '' : at(row, col)}
                        </div>
                      {/each}
                    </div>
                  {/each}
                </div>
              </div>
            </div>
            {#if gameOver}
              <div class="mt-3 p-3 bg-light rounded border text-center">
                <p class="fw-bold mb-2">게임 오버</p>
                <p class="mb-2">
                  최종 점수: <strong>{score}</strong>
                  {#if isLoggedIn}<span class="small text-muted">(랭킹에 반영됨)</span>{/if}
                </p>
                {#if !isLoggedIn}
                  <p class="small text-muted mb-2">로그인하면 점수를 랭킹에 올릴 수 있어요.</p>
                  <a href={resolve('/login')} class="btn btn-outline-primary mb-2">로그인</a>
                {/if}
                <button class="btn btn-outline-secondary ms-2" onclick={initGrid}>
                  다시 하기
                </button>
              </div>
            {/if}
          {/if}
        </div>
      </div>
    </div>
    <div class="col-12 col-md-4">
      <div class="card shadow rounded-4">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="mb-0">랭킹 Top 10</h5>
            {#if isLoggedIn}
              <button
                class="btn btn-sm btn-outline-secondary"
                onclick={loadRank}
                disabled={loading}
              >
                🔄
              </button>
            {:else}
              <a href={resolve('/login')} class="btn btn-sm btn-outline-primary">로그인</a>
            {/if}
          </div>
          <p class="small text-muted mb-1">3일 내 1인 1최고점 (뺑뺑이 점수와 별개)</p>
          <p class="small text-muted mb-2">
            오늘 참여 <strong>{todayStats.users}</strong>명 · 게임
            <strong>{todayStats.games}</strong>회
          </p>
          {#if isLoggedIn}
            <ol class="list-group list-group-numbered">
              {#each rankList as r (r._id ?? `${r.nickname}:${r.score}`)}
                <li class="list-group-item d-flex justify-content-between align-items-center">
                  <span>{r.nickname}</span>
                  <span class="fw-bold font-monospace">{formatScore(r.score)}</span>
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
  .game-2048-grid-wrapper {
    position: relative;
    display: inline-block;
    width: 100%;
    max-width: 320px;
  }
  .game-2048-grid-wrapper.game-2048-grid-5 {
    max-width: 380px;
  }
  .game-2048-grid {
    background-color: #bbada0;
    aspect-ratio: 1;
    width: 100%;
    display: block;
  }
  .game-2048-row {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }
  .game-2048-row:last-child {
    margin-bottom: 0;
  }
  .game-2048-tile {
    flex: 1;
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    border-radius: 6px;
    color: #776e65;
    transition:
      background-color 0.18s ease-out,
      font-size 0.18s ease-out,
      transform 0.18s cubic-bezier(0.2, 0.9, 0.2, 1);
  }
  .game-2048-tile:empty::before {
    content: '';
  }
  /* 움직일 때 타일 살짝 반응 */
  .game-2048-tile-tick {
    animation: tile-pop 0.16s ease-out;
  }
  @keyframes tile-pop {
    0% {
      transform: scale(0.985);
    }
    70% {
      transform: scale(1.015);
    }
    100% {
      transform: scale(1);
    }
  }
  .game-2048-tile-spawn {
    animation: tile-bling 0.32s ease-out;
  }
  @keyframes tile-bling {
    0% {
      transform: scale(0.6);
      filter: brightness(1.45);
      box-shadow: 0 0 0 rgba(255, 255, 255, 0);
    }
    45% {
      transform: scale(1.08);
      filter: brightness(1.18);
      box-shadow: 0 0 14px rgba(255, 255, 255, 0.55);
    }
    100% {
      transform: scale(1);
      filter: brightness(1);
      box-shadow: 0 0 0 rgba(255, 255, 255, 0);
    }
  }
  .game-2048-passed-overlay {
    position: absolute;
    inset: 0;
    border-radius: 0.5rem;
    background: rgba(187, 173, 160, 0.92);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    animation: passed-pulse 0.5s ease-out 2;
  }
  .game-2048-passed-text {
    font-size: clamp(2.25rem, 10vw, 3.5rem);
    font-weight: bold;
    color: #2d8a3e;
    text-align: center;
    line-height: 1.25;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.25);
    padding: 0.5rem;
  }
  .game-2048-passed {
    animation: passed-pulse 0.5s ease-out 2;
  }
  @keyframes passed-pulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.9;
      transform: scale(1.02);
    }
  }
</style>

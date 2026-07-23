import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const game2048Page = readFileSync('src/routes/games/2048/+page.svelte', 'utf8');
const watermelonPage = readFileSync('src/routes/games/watermelon/+page.svelte', 'utf8');
const minesweeperPage = readFileSync('src/routes/games/minesweeper/+page.svelte', 'utf8');
const slotPage = readFileSync('src/routes/games/slot/+page.svelte', 'utf8');
const sudokuPage = readFileSync('src/routes/games/sudoku/+page.svelte', 'utf8');
const billiardsPage = readFileSync('src/routes/games/billiards/+page.svelte', 'utf8');
const tetrisPage = readFileSync('src/routes/games/tetris/+page.svelte', 'utf8');
const breakoutPage = readFileSync('src/routes/games/breakout/+page.svelte', 'utf8');
const seotdaPage = readFileSync('src/routes/games/seotda/+page.svelte', 'utf8');
const ssamchiPage = readFileSync('src/routes/games/ssamchi/+page.svelte', 'utf8');
const rankingRow = readFileSync('src/lib/components/GameRankingRow.svelte', 'utf8');

describe('game ranking UI', () => {
  it('shows all-time rankings with relative score timestamps for 2048, watermelon, minesweeper, tetris, and breakout', () => {
    for (const page of [game2048Page, watermelonPage, minesweeperPage, tetrisPage, breakoutPage]) {
      expect(page).toContain('전체 기간');
      expect(page).toContain('formatRelativeTime');
      expect(page).not.toContain('3일 내');
    }
  });

  it('shows relative score timestamps for sudoku and billiards rankings', () => {
    for (const page of [sudokuPage, billiardsPage]) {
      expect(page).toContain('formatRelativeTime');
      expect(page).not.toContain('3일 내');
    }
  });

  it('shows only four-ball, pocket-ball, and art-puzzle billiards rankings', () => {
    expect(billiardsPage).toContain('aria-label="당구 랭킹 모드"');
    expect(billiardsPage).toContain("{ mode: BILLIARDS_MODES.FOUR_BALL, label: '4구' }");
    expect(billiardsPage).toContain("{ mode: BILLIARDS_MODES.POCKET_BALL, label: '포켓볼' }");
    expect(billiardsPage).toContain("{ mode: BILLIARDS_MODES.ART_PUZZLE, label: '예술구' }");
    expect(billiardsPage).toContain('? `${value}점` : String(value)');
    expect(billiardsPage).not.toContain("params.set('target'");
  });

  it('keeps billiards game-mode tab highlights mutually exclusive in art mode', () => {
    expect(billiardsPage).toContain(
      'class:active={!artMode && currentMode === BILLIARDS_MODES.FOUR_BALL}'
    );
    expect(billiardsPage).toContain(
      'class:active={!artMode && currentMode === BILLIARDS_MODES.POCKET_BALL}'
    );
    expect(billiardsPage).toContain('class:active={artMode}');
  });

  it('formats watermelon ranking scores with thousands separators', () => {
    expect(watermelonPage).toContain("Intl.NumberFormat('ko-KR')");
    expect(watermelonPage).toContain('formatScore(myBestScore)');
    expect(watermelonPage).toContain('formatScore(r.score)');
  });

  it('binds sudoku memo toggle visuals to memo mode state', () => {
    expect(sudokuPage).toContain('function toggleNoteMode(event: MouseEvent)');
    expect(sudokuPage).toContain('class:sudoku-note-toggle-active={noteMode}');
    expect(sudokuPage).toContain('class:sudoku-cell-note-selected={noteMode');
    expect(sudokuPage).toContain('aria-pressed={noteMode}');
    expect(sudokuPage).toContain('.blur()');
    expect(sudokuPage).toContain('disabled={!started || gameWon}');
  });

  it('keeps sudoku timer stopped until the start button is pressed', () => {
    expect(sudokuPage).toContain('function resetGame(');
    expect(sudokuPage).toContain('function hasGameProgress(): boolean');
    expect(sudokuPage).toContain('function changeDifficulty(nextDifficulty: Difficulty)');
    expect(sudokuPage).toContain("'게임을 새로 시작하시겠습니까?'");
    expect(sudokuPage).toContain("'게임을 중지하고 난이도를 변경하시겠습니까?'");
    expect(sudokuPage).toContain("reason === 'difficulty' && hasGameProgress()");
    expect(sudokuPage).toContain("resetGame(nextDifficulty, hasGameProgress(), 'difficulty');");
    expect(sudokuPage).toContain('onclick={() => changeDifficulty(key)}');
    expect(sudokuPage).toContain('started = false;');
    expect(sudokuPage).toContain('function startGame()');
    expect(sudokuPage).toContain('canResume = Boolean(saved.started) && !gameWon;');
    expect(sudokuPage).toContain("{canResume ? '게임재개' : '시작'}");
    expect(sudokuPage).toContain('게임재개를 누르면 시간이 다시 흐릅니다.');
    expect(sudokuPage).toContain('sudoku-start-layer');
    expect(sudokuPage).toContain('class:sudoku-board-paused={!started && !gameWon}');
    expect(sudokuPage).not.toContain('if (started && !gameWon) startTimer();');
  });

  it('uses SweetAlert instead of native confirm for sudoku resets', () => {
    expect(sudokuPage).toContain("import { swalFire } from '$lib/util/swal.js';");
    expect(sudokuPage).toContain('const result = await swalFire({');
    expect(sudokuPage).toContain('if (!result.isConfirmed) return;');
    expect(sudokuPage).not.toContain('window.confirm(');
  });

  it('removes the remaining native game confirmation', () => {
    expect(tetrisPage).toContain("import { swalFire } from '$lib/util/swal.js';");
    expect(tetrisPage).not.toContain("confirm('저장된 게임이 있습니다.");
  });

  it('shows when slot scores were last updated', () => {
    expect(slotPage).toContain('balanceUpdatedAt');
    expect(slotPage).toContain('formatSlotUpdatedAt(balanceUpdatedAt)');
    expect(slotPage).toContain('formatSlotUpdatedAt(r.updatedAt)');
  });

  it('uses one calm ranking layout across every ranked game', () => {
    for (const page of [
      game2048Page,
      watermelonPage,
      minesweeperPage,
      slotPage,
      sudokuPage,
      billiardsPage,
      tetrisPage,
      breakoutPage,
      seotdaPage,
      ssamchiPage
    ]) {
      expect(page).toContain("import GameRankingRow from '$lib/components/GameRankingRow.svelte';");
      expect(page).toContain('<GameRankingRow');
    }

    expect(rankingRow).toContain("index === 0 ? '👑'");
    expect(rankingRow).toContain("index === 0 ? '1위'");
    expect(rankingRow).toContain('grid-template-columns: 2rem minmax(0, 1fr) auto');
    expect(rankingRow).toContain('text-align: left');
    expect(rankingRow).toContain('text-align: right');
  });
});

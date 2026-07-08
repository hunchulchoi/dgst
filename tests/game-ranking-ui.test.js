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

  it('shows when slot scores were last updated', () => {
    expect(slotPage).toContain('balanceUpdatedAt');
    expect(slotPage).toContain('formatSlotUpdatedAt(balanceUpdatedAt)');
    expect(slotPage).toContain('formatSlotUpdatedAt(r.updatedAt)');
  });
});

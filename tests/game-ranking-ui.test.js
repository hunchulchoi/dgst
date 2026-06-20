import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const game2048Page = readFileSync('src/routes/games/2048/+page.svelte', 'utf8');
const watermelonPage = readFileSync('src/routes/games/watermelon/+page.svelte', 'utf8');
const minesweeperPage = readFileSync('src/routes/games/minesweeper/+page.svelte', 'utf8');

describe('game ranking UI', () => {
  it('shows all-time rankings with relative score timestamps for 2048, watermelon, and minesweeper', () => {
    for (const page of [game2048Page, watermelonPage, minesweeperPage]) {
      expect(page).toContain('전체 기간');
      expect(page).toContain('formatRelativeTime');
      expect(page).not.toContain('3일 내');
    }
  });
});

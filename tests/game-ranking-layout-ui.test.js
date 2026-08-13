import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const slotSource = readFileSync('src/routes/games/slot/+page.svelte', 'utf8');
const billiardsSource = readFileSync('src/routes/games/billiards/+page.svelte', 'utf8');
const breakoutSource = readFileSync('src/routes/games/breakout/+page.svelte', 'utf8');
const minesweeperSource = readFileSync('src/routes/games/minesweeper/+page.svelte', 'utf8');

describe('desktop game ranking layout', () => {
  it('keeps the slot ranking beside the game from the medium breakpoint', () => {
    expect(slotSource).toContain('class="col-md-6 order-2 order-md-1"');
    expect(slotSource).toContain('class="col-md-4 order-1 order-md-2 mb-3 mb-md-0"');
  });

  it('places the breakout ranking in a responsive sibling column', () => {
    expect(breakoutSource).toContain('class="col-12 col-md-7 col-xl-6"');
    expect(breakoutSource).toContain('class="col-12 col-md-5 col-xl-4 breakout-ranking-column"');
    expect(breakoutSource).toContain('class="card shadow rounded-4 mt-3 mt-md-0"');
  });

  it('places the billiards ranking beside the table on non-mobile screens', () => {
    expect(billiardsSource).toContain('class="billiards-game-column"');
    expect(billiardsSource).toContain('class="billiards-ranking-column"');
    expect(billiardsSource).toMatch(
      /@media \(min-width: 768px\)[\s\S]*?grid-template-columns: minmax\(0, 520px\) minmax\(240px, 320px\)/
    );
  });

  it('moves the minesweeper ranking below the full-width board on tablets', () => {
    expect(minesweeperSource).toMatch(
      /@media \(max-width: 1399\.98px\)[\s\S]*?\.minesweeper-game-row[\s\S]*?flex-direction: column/
    );
    expect(minesweeperSource).toMatch(
      /@media \(max-width: 1399\.98px\)[\s\S]*?\.minesweeper-rank-col[\s\S]*?order: 2 !important/
    );
    expect(minesweeperSource).toMatch(
      /@media \(max-width: 1399\.98px\)[\s\S]*?\.minesweeper-game-col[\s\S]*?order: 1 !important/
    );
    expect(minesweeperSource).toMatch(
      /@media \(min-width: 768px\) and \(max-width: 1399\.98px\)[\s\S]*?\.minesweeper-game-active[\s\S]*?padding-inline: 0 !important/
    );
    expect(minesweeperSource).toMatch(
      /@media \(min-width: 768px\) and \(max-width: 1399\.98px\)[\s\S]*?\.minesweeper-game-card-body[\s\S]*?padding: 0\.25rem/
    );
  });
});

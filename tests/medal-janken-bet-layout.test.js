import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const apiSource = readFileSync('src/routes/games/medal-janken/api/+server.js', 'utf8');
const gameSource = readFileSync('static/game-assets/medal-janken/index.html', 'utf8');
const pageSource = readFileSync('src/routes/games/medal-janken/+page.svelte', 'utf8');

describe('medal janken bet and ranking layout', () => {
  it('caps bets at 10,000 in both the game controls and API', () => {
    expect(apiSource).toContain('const MAX_BET = 10_000;');
    expect(apiSource).toContain('bet > MAX_BET');
    expect(gameSource).toContain('const MAX_BET = 10_000;');
    expect(gameSource).toContain('Math.min(MAX_BET, state.medals)');
    expect(gameSource).toContain('max="10000"');
  });

  it('does not make the ranking card internally scrollable', () => {
    const rankingMediaRule = pageSource.match(
      /@media \(max-width: 991\.98px\) \{[\s\S]*?@media \(max-width: 575\.98px\)/
    )?.[0];

    expect(rankingMediaRule).not.toContain('.ranking-card');
    expect(pageSource).not.toContain('max-height: 23rem');
  });
});

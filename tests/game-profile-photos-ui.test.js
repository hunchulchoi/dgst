import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const rankedGames = [
  '2048',
  'billiards',
  'breakout',
  'minesweeper',
  'sudoku',
  'tetris',
  'watermelon'
];
const rankingRow = readFileSync('src/lib/components/GameRankingRow.svelte', 'utf8');
const arcadeWallet = readFileSync('src/lib/server/arcadeWallet.js', 'utf8');

describe('game profile photos', () => {
  it('renders profile photos through the shared ranking row', () => {
    expect(rankingRow).toContain('GameProfilePhoto');
    expect(rankingRow).toContain('<GameProfilePhoto src={photo} name={nickname} />');
  });

  it.each(rankedGames)('adds profile photos to the %s ranking API and UI', (game) => {
    const server = readFileSync(`src/routes/games/${game}/+server.js`, 'utf8');
    const page = readFileSync(`src/routes/games/${game}/+page.svelte`, 'utf8');
    expect(server).toContain('attachGameProfilePhotos');
    expect(page).toContain('GameRankingRow');
  });

  it('adds profile photos to the shared arcade ranking used by slot', () => {
    const server = readFileSync('src/routes/games/slot/+server.js', 'utf8');
    const page = readFileSync('src/routes/games/slot/+page.svelte', 'utf8');
    expect(server).toContain('getArcadeRank');
    expect(arcadeWallet).toContain('attachGameProfilePhotos');
    expect(page).toContain('GameRankingRow');
  });

  it.each(['seotda', 'ssamchi'])('adds profile photos to the %s balance ranking', (game) => {
    const balance = readFileSync(`src/routes/games/${game}/${game}Balance.js`, 'utf8');
    const page = readFileSync(`src/routes/games/${game}/+page.svelte`, 'utf8');
    expect(balance).toContain('getArcadeRank');
    expect(arcadeWallet).toContain('attachGameProfilePhotos');
    expect(page).toContain('GameRankingRow');
  });

  it('shows social time and optional photos in shared game replies', () => {
    const comments = readFileSync('src/lib/components/SharedGameComments.svelte', 'utf8');
    const endpoint = readFileSync('src/routes/games/slot/comment/+server.js', 'utf8');
    expect(endpoint).toContain('attachGameProfilePhotos');
    expect(comments).toContain('formatRelativeTime(value, { locale: ko, addSuffix: true })');
    expect(comments).toContain('src={comment.photo}');
  });

  it('shows optional photos in slot and ssamchi replies', () => {
    for (const game of ['slot', 'ssamchi']) {
      const page = readFileSync(`src/routes/games/${game}/+page.svelte`, 'utf8');
      expect(page).toContain('src={comment.photo}');
    }
  });
});

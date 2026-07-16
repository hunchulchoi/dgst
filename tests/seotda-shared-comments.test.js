import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const seotdaPage = readFileSync('src/routes/games/seotda/+page.svelte', 'utf8');
const sharedComments = readFileSync('src/lib/components/SharedGameComments.svelte', 'utf8');
const commentRoute = readFileSync('src/routes/games/slot/comment/+server.js', 'utf8');

describe('seotda shared game comments', () => {
  it('renders the shared reply feed and posts rewards to the seotda balance', () => {
    expect(seotdaPage).toContain('<SharedGameComments');
    expect(sharedComments).toContain("form.set('game', 'seotda')");
    expect(commentRoute).toContain("rewardGame === 'seotda'");
    expect(commentRoute).toContain("game: { in: ['slot', 'seotda'] }");
    expect(commentRoute).toContain('todayRewardCount < 10');
    expect(commentRoute).toContain('writeSeotdaScore(email, nickname, newBalance');
  });

  it('writes automatic shared replies for ddaeng and bust results', () => {
    expect(seotdaPage).toContain('writeRoundAutomaticComments(next, balance)');
    expect(seotdaPage).toContain('🃏 섯다 땡!');
    expect(seotdaPage).toContain('😢 섯다 오링!');
    expect(seotdaPage).toContain("form.set('automatic', '1')");
    expect(seotdaPage).toContain("fetch('/games/slot/comment'");
    expect(commentRoute).toContain('!automatic && todayRewardCount < 10');
  });

  it('closes the hand-complete layer instead of starting a busted hand', () => {
    expect(seotdaPage).toContain('const isBustResult = $derived');
    expect(seotdaPage).toContain('오링! 5분 뒤 700점이 리필됩니다.');
    expect(seotdaPage).toContain('onclick={closeResultLayer}');
    expect(seotdaPage).toContain('{#if isBustResult}');
  });

  it('shows the refill countdown on the disabled start button', () => {
    expect(seotdaPage).toContain('function startOopsCountdown');
    expect(seotdaPage).toContain('function formatOopsCountdown');
    expect(seotdaPage).toContain('판 시작 {formatOopsCountdown(oopsRemainingMs)}');
    expect(seotdaPage).toContain('onclick={bustRoundPending ? nextRound : startRound}');
    expect(seotdaPage).toContain('disabled={busy || !!oopsInfo?.waiting || oopsRemainingMs > 0}');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const seotdaPage = readFileSync('src/routes/games/seotda/+page.svelte', 'utf8');
const sharedComments = readFileSync('src/lib/components/SharedGameComments.svelte', 'utf8');
const ssamchiPage = readFileSync('src/routes/games/ssamchi/+page.svelte', 'utf8');
const commentRoute = readFileSync('src/routes/games/slot/comment/+server.js', 'utf8');

describe('seotda shared game comments', () => {
  it('renders the shared reply feed and posts rewards to the seotda balance', () => {
    expect(seotdaPage).toContain('<SharedGameComments');
    expect(sharedComments).toContain("form.set('game', game)");
    expect(commentRoute).toContain("rewardGame === 'seotda'");
    expect(commentRoute).toContain("game: { in: ['slot', 'seotda', 'ssamchi'] }");
    expect(commentRoute).toContain('todayRewardCount < 10');
    expect(commentRoute).toContain('writeSeotdaScore(email, nickname, newBalance');
  });

  it('writes automatic shared replies for ddaeng and bust results', () => {
    expect(seotdaPage).toContain('writeRoundAutomaticComments(next, balance)');
    expect(seotdaPage).toContain('🃏 섯다 땡!');
    expect(seotdaPage).toContain('nextRound.ddaengValuePerLoser');
    expect(seotdaPage).toContain('nextRound.ddaengTotalPaid');
    expect(seotdaPage).toContain('nextRound.userChipDelta');
    expect(seotdaPage).toContain('실제 수익');
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

  it('keeps the idle state inside the green game table', () => {
    expect(seotdaPage).toContain(
      'class="seotda-table seotda-table-idle rounded-4 p-3 mb-3"'
    );
    expect(seotdaPage).toContain('linear-gradient(160deg, #1a573e 0%, #0b3023 100%)');
    expect(seotdaPage).toContain('min-height: clamp(320px, 48vh, 470px)');
  });

  it('limits the comment form and reply list width on seotda and ssamchi', () => {
    expect(seotdaPage).toContain('<div class="col-lg-8">');
    expect(seotdaPage).toContain('<SharedGameComments');
    expect(ssamchiPage).toContain('<section class="col-lg-8 order-2 order-lg-1">');
    expect(ssamchiPage).toContain('<aside class="col-lg-4 order-1 order-lg-2">');
    expect(ssamchiPage).toContain('width: calc(100% * 2 / 3)');
    expect(ssamchiPage).toContain('@media (min-width: 992px)');
  });
});

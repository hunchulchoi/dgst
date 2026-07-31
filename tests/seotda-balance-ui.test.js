import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync('src/routes/games/seotda/+page.svelte', 'utf8');
const serverSource = readFileSync('src/routes/games/seotda/+server.js', 'utf8');

describe('seotda betting UI', () => {
  it('uses the same contribution-capacity function as the server engine', () => {
    expect(pageSource).toContain("import { contributionCapacity } from './seotdaRound.js'");
    expect(pageSource).toContain('round && userSeat ? contributionCapacity(round, userSeat) : 0');
  });

  it('resets the next hand raise amount to a legal non-zero default', () => {
    expect(pageSource).toContain('function resetRaiseBet(nextRound: SeotdaRound | null');
    expect(pageSource).toContain('raiseBet = minRaisePay(0, ante)');
    expect(pageSource).toContain('const nextMinimum = minRaisePay(nextToCall, ante)');
    expect(pageSource).toContain(
      "else if (body.action === 'ack' || body.action === 'start') resetRaiseBet(next, balance)"
    );
  });

  it('keeps raise input and presets inside the my-turn layer', () => {
    expect(pageSource).toContain('class="turn-action-layer"');
    expect(pageSource).toContain('class="turn-bet-controls"');
    expect(pageSource).toContain('id="turn-raise-bet"');
    expect(pageSource).toContain('class="form-control form-control-sm turn-bet-input"');
    expect(pageSource).not.toContain('class="bet-box');
  });

  it('carries the previous winner into the next round as the opening actor', () => {
    expect(serverSource).toContain("const openingActorId = round?.winnerId ?? 'user'");
    expect(serverSource).toMatch(
      /createNewRound\(\s*balance,\s*Math\.random,\s*npcChips,\s*openingActorId,\s*sparkTauntCooldown,\s*sparkDecision,/s
    );
  });

  it('asks Codex app-server asynchronously to decide Spark intervention without a random chance', () => {
    expect(serverSource).toContain('const pending = decideSparkIntervention(context)');
    expect(serverSource).toContain('refreshSparkDecisionInBackground(email, sparkContext)');
    expect(serverSource).not.toContain('await sparkPending');
    expect(serverSource).toContain('sparkInterventionHands');
    expect(serverSource).toContain('getSeotdaSparkHistory');
    expect(serverSource).toContain('sparkDecision');
  });

  it('forces an asynchronous Spark request after a one-billion-point raise', () => {
    expect(serverSource).toContain('shouldForceSparkForRaise(move, appliedRaisePay)');
    expect(serverSource).toContain("trigger: 'user-high-raise'");
    expect(serverSource).toContain('highRaisePay: appliedRaisePay');
    expect(serverSource).toContain('Spark: 10억 이상 레이스 판단 요청');
  });

  it('covers current-hand Spark inference with a deal animation', () => {
    expect(pageSource).toContain('let dealing = $state(false)');
    expect(pageSource).toContain('class="deal-curtain"');
    expect(pageSource).toContain('화투패를 섞는 중');
    expect(pageSource).toContain('한 장씩 돌리는 중');
    expect(pageSource).toContain('@keyframes dealCardFlight');
  });

  it('renders sparse Spark taunts returned with NPC betting actions', () => {
    expect(pageSource).toContain('taunt?: string | null');
    expect(pageSource).toContain('{#if preview.taunt}');
    expect(pageSource).toContain('class="spark-taunt"');
  });

  it('shows a ddaeng value layer after showdown card reveals', () => {
    expect(pageSource).toContain('ddaengLayerOpen');
    expect(pageSource).toContain('class="ddaeng-value-backdrop"');
    expect(pageSource).toContain('round.ddaengValuePerLoser');
    expect(pageSource).toContain('round.ddaengTotalPaid');
    expect(pageSource).toContain('땡값');
  });

  it('shows per-seat action effects and floats actions over the table on the user turn', () => {
    expect(pageSource).toContain('function actionEffectText(seat: SeotdaSeat)');
    expect(pageSource).toContain('class="action-effect"');
    expect(pageSource).toContain('class="turn-action-layer"');
    expect(pageSource).toContain('aria-label="내 행동 선택"');
    expect(pageSource).toContain("onclick={() => act('die')}");
    expect(pageSource).toContain("onclick={() => act('call')}");
    expect(pageSource).toContain("onclick={() => act('raise')}");
  });

  it('paces NPC calls and raises with a short randomized thinking delay', () => {
    expect(pageSource).toContain('function npcActionDelay(action: string)');
    expect(pageSource).toContain("action === '콜' || action === '레이즈'");
    expect(pageSource).toContain('await playNpcActions(npcActions)');
  });

  it('keeps all three NPC card pairs horizontal on narrow mobile tables', () => {
    expect(pageSource).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(pageSource).toContain('.npc-row .cards');
    expect(pageSource).toContain('flex-wrap: nowrap');
    expect(pageSource).toContain('.npc-row .hwatu-flip');
  });

  it('offers board sharing after showdown', () => {
    expect(pageSource).toContain('function openShare()');
    expect(pageSource).toContain("fetch('/games/seotda/share'");
    expect(pageSource).toContain('게시판 공유');
    expect(pageSource).toContain(
      '{#if isShowdown && revealDone && !ddaengLayerOpen && !shareOpen && !resultLayerDismissed}'
    );
    expect(pageSource).toContain('class="result-action-backdrop"');
    expect(pageSource).toContain('use:keepBelowSiteHeader');
    expect(pageSource).toContain('inset: var(--result-safe-top, 0) 0 0');
    expect(pageSource).toContain('class="result-action-layer"');
    expect(pageSource).toContain('class="result-action-delta"');
    expect(pageSource).toContain('+{formatNumber(userGameDelta)}점 땄다');
    expect(pageSource).toContain('-{formatNumber(Math.abs(userGameDelta))}점 잃었다');
    expect(pageSource).toContain('🪙 개평 +{formatNumber(gaepyeongAmount)}점');
    expect(pageSource).toContain(
      '{formatNumber(userChipsBefore)}점 → {formatNumber(userChipsAfter)}점'
    );
    expect(pageSource).toContain('onclick={nextRound}');
    expect(serverSource).toContain(
      "throw error(400, { message: '끝난 판에서 다음 판을 눌러야 새 패를 돌릴 수 있습니다.' })"
    );
    expect(serverSource).toContain('applyGaepyeongIfOops');
    expect(serverSource).toContain('writeSeotdaSettlement');
  });

  it('hides the boss result pair until the user scrolls to reveal it', () => {
    expect(pageSource).toContain('let bossResultRevealed = $state(false)');
    expect(pageSource).toContain('function revealBossResultOnScroll');
    expect(pageSource).toContain('class="boss-result-scroll"');
    expect(pageSource).toContain('아래로 스크롤해서 마지막 2장 공개');
    expect(pageSource).not.toContain('만들 수 있는 도리 없음 · 노메이드');
  });

  it('pauses before revealing the boss dori one card at a time', () => {
    expect(pageSource).toContain('let bossDoriRevealCount = $state(0)');
    expect(pageSource).toContain('function scheduleBossDoriReveal');
    expect(pageSource).toContain('보스가 도리를 확인하는 중');
    expect(pageSource).toContain('bossDoriRevealCount >= 3');
  });

  it('lets the player switch rooms before starting the next hand', () => {
    expect(pageSource).toContain('class="next-room-picker"');
    expect(pageSource).toContain('다음 판 방 선택');
    expect(pageSource).toContain("onclick={() => (selectedRuleMode = 'basic')}");
    expect(pageSource).toContain("onclick={() => (selectedRuleMode = 'classic')}");
    expect(pageSource).toContain("await post({ action: 'ack', ruleMode: selectedRuleMode })");
    expect(pageSource).toContain("{selectedRuleMode === 'classic' ? '정통방' : '기본방'}");
    expect(serverSource).toContain('body?.ruleMode == null');
    expect(serverSource).toContain('normalizeRuleMode(round.ruleMode)');
    expect(serverSource).toContain('normalizeRuleMode(body.ruleMode)');
    expect(serverSource).toContain('normalizeRuleMode(prev.ruleMode)');
    expect(serverSource).toContain('nextRuleMode,');
  });
});

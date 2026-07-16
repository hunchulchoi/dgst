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
      /createNewRound\(\s*balance,\s*Math\.random,\s*npcChips,\s*openingActorId,\s*sparkTauntCooldown,\s*sparkDecision\s*\)/s
    );
  });

  it('asks Codex app-server asynchronously to decide Spark intervention without a random chance', () => {
    expect(serverSource).toContain('const pending = decideSparkIntervention(context)');
    expect(serverSource).toContain('refreshSparkDecisionInBackground(email, sparkContext)');
    expect(serverSource).toContain('getSeotdaSparkHistory');
    expect(serverSource).toContain('sparkDecision');
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
      '{#if isShowdown && revealDone && !ddaengLayerOpen && !shareOpen}'
    );
    expect(pageSource).toContain('class="result-action-backdrop"');
    expect(pageSource).toContain('class="result-action-layer"');
    expect(pageSource).toContain('onclick={nextRound}');
  });
});

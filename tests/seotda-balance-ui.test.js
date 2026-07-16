import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync('src/routes/games/seotda/+page.svelte', 'utf8');
const serverSource = readFileSync('src/routes/games/seotda/+server.js', 'utf8');

describe('seotda betting UI', () => {
  it('uses the same contribution-capacity function as the server engine', () => {
    expect(pageSource).toContain("import { contributionCapacity } from './seotdaRound.js'");
    expect(pageSource).toContain('round && userSeat ? contributionCapacity(round, userSeat) : 0');
  });

  it('carries the previous winner into the next round as the opening actor', () => {
    expect(serverSource).toContain("const openingActorId = round?.winnerId ?? 'user'");
    expect(serverSource).toContain(
      'createNewRound(balance, Math.random, npcChips, openingActorId)'
    );
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
});

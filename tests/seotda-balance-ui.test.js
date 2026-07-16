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
    expect(serverSource).toMatch(
      /createNewRound\(\s*balance,\s*Math\.random,\s*npcChips,\s*openingActorId,\s*sparkTauntCooldown\s*\)/s
    );
  });

  it('renders sparse Spark taunts returned with NPC betting actions', () => {
    expect(pageSource).toContain('taunt?: string | null');
    expect(pageSource).toContain('{#if preview.taunt}');
    expect(pageSource).toContain('class="spark-taunt"');
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

  it('offers board sharing after showdown', () => {
    expect(pageSource).toContain('function openShare()');
    expect(pageSource).toContain("fetch('/games/seotda/share'");
    expect(pageSource).toContain('게시판 공유');
  });
});

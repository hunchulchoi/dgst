import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync('src/routes/games/seotda/+page.svelte', 'utf8');
const state = readFileSync('src/routes/games/seotda/seotdaState.js', 'utf8');

describe('seotda replay deal UI', () => {
  it('publishes replay identity and reason to the client', () => {
    expect(state).toContain('dealNo: (round.handHistory?.length ?? 0) + 1');
    expect(state).toContain('replayReason: round.replayReason ?? null');
  });

  it('announces a replay before restarting the deal animation', () => {
    expect(page).toContain("import { swalFire } from '$lib/util/swal.js';");
    expect(page).toContain('const isReplayDeal =');
    expect(page).toContain('팟을 유지하고 패를 다시 나눕니다.');
    expect(page).toMatch(
      /if \(isReplayDeal\)[\s\S]*?await swalFire\([\s\S]*?applyRound\(next, false, true\);/
    );
    expect(page).toContain(
      "if (!isReplayDeal) applyRound(next, body.action === 'act' && hitShowdown);"
    );
  });
});

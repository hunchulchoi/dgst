import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const replayPlayer = readFileSync('src/lib/components/BilliardsReplayPlayer.svelte', 'utf8');

describe('billiards board replay player UI', () => {
  it('visualizes recorded spin and power', () => {
    expect(replayPlayer).toContain('class="replay-spin-ball"');
    expect(replayPlayer).toContain('clip-path: circle(50% at 50% 50%)');
    expect(replayPlayer).toContain('class="replay-spin-dot"');
    expect(replayPlayer).toContain('left: {spinLeft}%');
    expect(replayPlayer).toContain('top: {spinTop}%');
    expect(replayPlayer).toContain('class="replay-power-fill"');
    expect(replayPlayer).toContain('width: {powerPercent}%');
    expect(replayPlayer).toContain('aria-label="리플레이 당점"');
    expect(replayPlayer).toContain('aria-label="리플레이 파워"');
    expect(replayPlayer).not.toContain('<strong>{sideSpin} / {verticalSpin}</strong>');
    expect(replayPlayer).not.toContain('<strong>{powerPercent}</strong>');
    expect(replayPlayer).not.toContain('class="power-scale"');
  });
});

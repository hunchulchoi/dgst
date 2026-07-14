import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const billiardsPage = readFileSync('src/routes/games/billiards/+page.svelte', 'utf8');

describe('billiards controls UI', () => {
  it('renders the spin target as a circular cue ball at both sizes', () => {
    expect(billiardsPage).toContain('width: var(--tip-ball-size)');
    expect(billiardsPage).toContain('height: var(--tip-ball-size)');
    expect(billiardsPage).toContain('clip-path: circle(50% at 50% 50%)');
    expect(billiardsPage).toContain('--tip-ball-size: min(72vw, 238px)');
  });

  it('shows one ten-stage art puzzle track with a help button', () => {
    expect(billiardsPage).not.toContain('ART_DIFFICULTIES');
    expect(billiardsPage).not.toContain('artDifficulty');
    expect(billiardsPage).toContain('aria-label="예술구 단계"');
    expect(billiardsPage).toContain('aria-label="예술구 도움"');
    expect(billiardsPage).toContain("{helpPlan ? '도움 닫기' : '도움'}");
  });
});

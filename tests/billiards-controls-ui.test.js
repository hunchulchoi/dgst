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

  it('shows art puzzle retry and next-stage actions in a table overlay', () => {
    expect(billiardsPage).toContain('class="art-result-layer"');
    expect(billiardsPage).toContain('aria-label="예술구 결과"');
    expect(billiardsPage).toContain('class="art-result-actions"');
    expect(billiardsPage).toContain("{#if status === 'game-over' && !artMode}");
  });

  it('shows art technique score bonuses and remembers help use', () => {
    expect(billiardsPage).toContain('computeArtScore');
    expect(billiardsPage).toContain('artHelpUsed = true');
    expect(billiardsPage).toContain('무도움');
    expect(billiardsPage).toContain('시네루');
    expect(billiardsPage).toContain('당점');
  });

  it('restores and periodically saves the current game', () => {
    expect(billiardsPage).toContain('BILLIARDS_SAVE_KEY');
    expect(billiardsPage).toContain('restoreSavedGame()');
    expect(billiardsPage).toContain("addEventListener('pagehide', saveGame)");
    expect(billiardsPage).toContain('aria-live="polite"');
    expect(billiardsPage).not.toMatch(/(?:window\.)?(?:alert|confirm)\s*\(/);
  });

  it('queues follow and draw physics before branching into art scoring', () => {
    const collisionHandler = billiardsPage.slice(
      billiardsPage.indexOf('const handleCollisionStart'),
      billiardsPage.indexOf("Events.on(engine, 'collisionStart'")
    );

    expect(collisionHandler).toContain('queueActiveCueSpinContact');
    expect(collisionHandler.indexOf('queueActiveCueSpinContact')).toBeLessThan(
      collisionHandler.indexOf('if (artMode)')
    );
  });

  it('lets the remaining balls finish rolling after the last object ball is pocketed', () => {
    const pocketHandler = billiardsPage.slice(
      billiardsPage.indexOf('function handlePocketedBalls'),
      billiardsPage.indexOf('function applyDynamicRollingDrag')
    );

    expect(pocketHandler).not.toContain('settleShot()');
  });
});

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

  it('keeps shot controls untouched while the approximate guide stays visible', () => {
    expect(billiardsPage).toContain('type ShotHelpPlan');
    expect(billiardsPage).not.toContain('function applyShotHelpControls');
    expect(billiardsPage).not.toContain('추천값 다시 적용');

    const showHelp = billiardsPage.slice(
      billiardsPage.indexOf('function showShotHelp'),
      billiardsPage.indexOf('function performNpcShot')
    );
    for (const assignment of [
      'aimAngle = plan.angle',
      'displayAimAngle = plan.angle',
      'power = plan.power',
      'spin = plan.sideSpin',
      'verticalSpin = plan.verticalSpin'
    ]) {
      expect(showHelp).not.toContain(assignment);
    }

    const controlUpdates = billiardsPage.slice(
      billiardsPage.indexOf('function updateAimFromPointer'),
      billiardsPage.indexOf('function handlePointerDown')
    );
    expect(controlUpdates).not.toContain('helpPlan = null');
    expect(billiardsPage).toContain('직접 조준·파워·당점을 맞춰보세요');
  });

  it('shows authored art help as a broad hint instead of exact control values', () => {
    const artHelp = billiardsPage.slice(
      billiardsPage.indexOf('{#if artMode}'),
      billiardsPage.indexOf('{:else if !isPocketBall}')
    );
    expect(artHelp).toContain('{currentArtStage.solution.tipLabel}');
    expect(artHelp).toContain('helpPlan.power - 6');
    expect(artHelp).toContain('helpPlan.power + 6');
    expect(artHelp).not.toContain('{helpPlan.sideSpin}');
    expect(artHelp).not.toContain('{helpPlan.verticalSpin}');
  });

  it('shows approximate four-ball hints and scans targeted help candidates', () => {
    const fourBallHelp = billiardsPage.slice(
      billiardsPage.indexOf('{:else if !isPocketBall}'),
      billiardsPage.indexOf('<section class="game-shell"')
    );
    expect(fourBallHelp).toContain('중앙 부근 당점');
    expect(fourBallHelp).toContain('helpPlan.power - 8');
    expect(fourBallHelp).toContain('helpPlan.power + 8');
    expect(fourBallHelp).not.toContain('{helpPlan.sideSpin}');
    expect(fourBallHelp).not.toContain('{helpPlan.verticalSpin}');
    expect(billiardsPage).toContain(
      "chooseFourBallShot('player', FOUR_BALL_HELP_FAST_CANDIDATE_BUDGET)"
    );
    expect(billiardsPage).toContain(
      "chooseFourBallShot('player', FOUR_BALL_HELP_FALLBACK_CANDIDATE_BUDGET)"
    );
    expect(billiardsPage).toContain('if (plan.defensive)');
    expect(billiardsPage).toContain(
      'const FOUR_BALL_HELP_FALLBACK_CANDIDATE_BUDGET = Number.POSITIVE_INFINITY'
    );
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

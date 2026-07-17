import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const replayPlayer = readFileSync('src/lib/components/BilliardsReplayPlayer.svelte', 'utf8');
const boardList = readFileSync('src/lib/components/board_list.svelte', 'utf8');
const boardArticle = readFileSync(
  'src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.svelte',
  'utf8'
);

describe('billiards board replay player UI', () => {
  it('uses recorded table geometry with legacy replay fallbacks', () => {
    expect(replayPlayer).toContain('Number.isFinite(shot?.tableWidth)');
    expect(replayPlayer).toContain('Number.isFinite(shot?.tableHeight)');
    expect(replayPlayer).toContain('Number.isFinite(shot?.ballRadius)');
    expect(replayPlayer).toContain(': 360');
    expect(replayPlayer).toContain(': 560');
    expect(replayPlayer).toContain(': 11.5');
    expect(replayPlayer).toContain('Number.isFinite(shot?.tableWidth) &&');
    expect(replayPlayer).toContain('(ballRadius / CURRENT_BALL_RADIUS) * 18');
    expect(replayPlayer).toContain('(ballRadius / CURRENT_BALL_RADIUS) * 12');
    expect(replayPlayer).toContain('width={tableWidth}');
    expect(replayPlayer).toContain('height={tableHeight}');
    expect(replayPlayer).toContain('context.arc(ball.x, ball.y, ballRadius');
  });

  it('redraws changed replay props and reproduces physical pocket jaws', () => {
    expect(replayPlayer).toContain('$effect(() =>');
    expect(replayPlayer).toContain('const firstFrame = frames[0]');
    expect(replayPlayer).toContain('getPocketRailGeometry()');
    expect(replayPlayer).toContain('for (const jaw of geometry.jaws)');
    expect(replayPlayer).toContain('for (const rail of geometry.rails)');
    expect(replayPlayer).toContain('onDestroy(stop)');
  });

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
    expect(replayPlayer).not.toContain('왼쪽/오른쪽 · 아래/위');
  });

  it('marks billiards replay posts with a billiards icon', () => {
    expect(replayPlayer).toContain('🎱</span> 당구 리플레이');
    expect(boardList).toContain('article.hasBilliardsReplay');
    expect(boardList).toContain("article.title?.startsWith('[당구 리플레이]')");
    expect(boardList).toContain('<span aria-label="당구 리플레이">🎱</span>');
    expect(boardArticle).toContain(
      '{#if data.billiardsReplay}<span aria-label="당구 리플레이">🎱</span>{/if}'
    );
  });
});

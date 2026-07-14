import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const replayPlayer = readFileSync('src/lib/components/BilliardsReplayPlayer.svelte', 'utf8');
const boardList = readFileSync('src/lib/components/board_list.svelte', 'utf8');
const boardArticle = readFileSync(
  'src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.svelte',
  'utf8'
);

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
    expect(replayPlayer).not.toContain('왼쪽/오른쪽 · 아래/위');
  });

  it('marks billiards replay posts with a billiards icon', () => {
    expect(replayPlayer).toContain('🎱</span> 당구 리플레이');
    expect(boardList).toContain("article.content?.includes('당구 리플레이를 공유했습니다.')");
    expect(boardList).toContain('<span aria-label="당구 리플레이">🎱</span>');
    expect(boardArticle).toContain(
      '{#if data.billiardsReplay}<span aria-label="당구 리플레이">🎱</span>{/if}'
    );
  });
});

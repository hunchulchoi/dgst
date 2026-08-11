import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const alarmPage = readFileSync('src/routes/board/alarm/+page.svelte', 'utf8');

describe('reply alarm link', () => {
  it('targets the latest reply instead of the parent comment', () => {
    expect(alarmPage).toMatch(
      /commentIds\.length\s*>\s*0\s*\?\s*commentIds\[commentIds\.length\s*-\s*1\]\s*:\s*alarm\.comment/
    );
    expect(alarmPage).toContain('`/board/${alarm.boardId}/${alarm.articleId}?a=cmt${commentId}&alarm=${alarm.id}`');
  });
});

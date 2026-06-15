import { describe, expect, it } from 'vitest';
import { formatAlarmCommentPreview } from '../src/lib/util/alarmPreview.js';

describe('formatAlarmCommentPreview', () => {
  it('collapses whitespace and truncates long comment previews', () => {
    const text =
      '첫 줄입니다.\n\n두 번째 줄도 있고    공백도 많고 알림 목록에서 그대로 보이면 너무 길어서 지저분해지는 댓글입니다.';

    expect(formatAlarmCommentPreview(text, 30)).toBe('첫 줄입니다. 두 번째 줄도 있고 공백도 많고 알림 목...');
  });

  it('keeps short comments unchanged after whitespace normalization', () => {
    expect(formatAlarmCommentPreview('짧은\n댓글입니다.', 60)).toBe('짧은 댓글입니다.');
  });
});

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

  it('replaces audio tags with an audio marker', () => {
    const html =
      '<audio src="/images/jjal/2026/6/18/comment-recorded-audio.webm" controls style="max-width: 100%; width: 100%; display: block; margin: 0.5em 0;"></audio>';

    expect(formatAlarmCommentPreview(html, 60)).toBe('🎧');
  });

  it('keeps text around audio tags while hiding the tag markup', () => {
    const html = '확인해 주세요 <audio src="/voice.m4a" controls></audio>';

    expect(formatAlarmCommentPreview(html, 60)).toBe('확인해 주세요 🎧');
  });
});

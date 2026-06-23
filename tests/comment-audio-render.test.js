import { describe, expect, it } from 'vitest';

import { viewComment } from '../src/lib/util/embeder.js';

describe('comment audio rendering', () => {
  it('preserves uploaded audio players in rendered comments', () => {
    const rendered = viewComment(
      '<audio src="/images/jjal/2026/6/18/comment-recorded-audio.webm" controls style="max-width: 100%; width: 100%; display: block; margin: 0.5em 0;"></audio>'
    );

    expect(rendered).toContain('<audio');
    expect(rendered).toContain('src="/images/jjal/2026/6/18/comment-recorded-audio.webm"');
    expect(rendered).toContain('controls');
  });

  it('keeps plain comment URLs clickable in the comment body', () => {
    const rendered = viewComment('본문 링크 https://example.com/path?q=1&next=2 확인');

    expect(rendered).toContain(
      '<a href="https://example.com/path?q=1&amp;next=2" target="_blank" rel="noopener noreferrer">https://example.com/path?q=1&amp;next=2</a>'
    );
  });

  it('keeps youtube embeds separate from plain clickable URLs', () => {
    const rendered = viewComment(
      '영상 https://youtu.be/abc123xyz89 참고 https://example.com/post'
    );

    expect(rendered).toContain('src="https://www.youtube.com/embed/abc123xyz89"');
    expect(rendered).toContain(
      '<a href="https://example.com/post" target="_blank" rel="noopener noreferrer">https://example.com/post</a>'
    );
  });
});

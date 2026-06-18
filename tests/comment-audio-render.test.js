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
});

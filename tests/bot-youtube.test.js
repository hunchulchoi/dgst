import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeYoutube, youtubeIdFromUrl, youtubeIds } from '../src/lib/server/mcp/botYoutube.js';

afterEach(() => vi.unstubAllGlobals());

describe('bot youtube', () => {
  it('extracts video ids from embeds, links and shorts', () => {
    expect(youtubeIdFromUrl('https://www.youtube.com/embed/AbizqujZr90')).toBe('AbizqujZr90');
    expect(youtubeIdFromUrl('https://youtu.be/pV0Pl4WQ59I?t=3')).toBe('pV0Pl4WQ59I');
    expect(youtubeIdFromUrl('https://m.youtube.com/watch?v=QVcbSssI-8M&amp;t=1')).toBe(
      'QVcbSssI-8M'
    );
    expect(youtubeIdFromUrl('https://www.youtube.com/shorts/QVcbSssI-8M')).toBe('QVcbSssI-8M');
    expect(youtubeIdFromUrl('https://evil.example/embed/AbizqujZr90')).toBeNull();
    expect(youtubeIdFromUrl('https://www.youtube.com/embed/short')).toBeNull();
    expect(
      youtubeIds(
        '<iframe src="https://www.youtube.com/embed/AbizqujZr90"></iframe> https://youtu.be/AbizqujZr90'
      )
    ).toEqual(['AbizqujZr90']);
  });

  it('replaces youtube iframes with title and channel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ title: '인스타360 리뷰', author_name: '코왕' })
      })
    );
    const { html, videos } = await describeYoutube(
      '<p>이거 봐</p><iframe src="https://www.youtube.com/embed/AbizqujZr90" width="560"></iframe><iframe src="https://player.example/x"></iframe>'
    );
    expect(html).toContain('[유튜브 1: "인스타360 리뷰" - 코왕]');
    expect(html).toContain('player.example');
    expect(videos).toEqual([
      {
        n: 1,
        id: 'AbizqujZr90',
        info: { id: 'AbizqujZr90', title: '인스타360 리뷰', channel: '코왕' }
      }
    ]);
  });
});

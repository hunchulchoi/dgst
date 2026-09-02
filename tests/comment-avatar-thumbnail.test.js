import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { imageThumbnailUrl } from '../src/lib/util/imageThumbnail.js';

const articlePage = readFileSync(
  'src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.svelte',
  'utf8'
);
const boardList = readFileSync('src/lib/components/board_list.svelte', 'utf8');

describe('comment avatar thumbnails', () => {
  it('requests an 80px thumbnail for locally uploaded profile photos', () => {
    expect(imageThumbnailUrl('/images/profiles/avatar.webp', 80)).toBe(
      '/images/profiles/avatar.webp?thumbnail=80&animated=1'
    );
    expect(imageThumbnailUrl('/images/profiles/avatar.webp?v=2', 80)).toBe(
      '/images/profiles/avatar.webp?v=2&thumbnail=80&animated=1'
    );
  });

  it('keeps external profile photos and bundled fallback icons unchanged', () => {
    expect(imageThumbnailUrl('https://example.com/avatar.jpg', 80)).toBe(
      'https://example.com/avatar.jpg'
    );
    expect(imageThumbnailUrl('/icons/unknown-person-icon-4.jpg', 80)).toBe(
      '/icons/unknown-person-icon-4.jpg'
    );
  });

  it('uses the thumbnail URL in the board comment list', () => {
    expect(articlePage).toContain('imageThumbnailUrl(');
    expect(articlePage).toContain('decoding="async"');
  });

  it('uses a 40px thumbnail in the board article list', () => {
    expect(boardList).toContain('imageThumbnailUrl(article.photo, 40)');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const lexicalEditor = readFileSync('src/lib/components/LexicalEditor.svelte', 'utf8');
const articlePage = readFileSync(
  'src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.svelte',
  'utf8'
);
const commentEmbeder = readFileSync('src/lib/util/embeder.js', 'utf8');
const sanitizeArticleContent = readFileSync('src/lib/server/sanitizeArticleContent.js', 'utf8');

describe('youtube shorts mobile width', () => {
  it('marks youtube shorts iframes so mobile article rendering can force full width', () => {
    expect(lexicalEditor).toContain("class=\"youtube-shorts-embed\"");
    expect(lexicalEditor).toContain("const widthStyle = youtube.isShorts ? '100%' : `${youtube.width}px`");
    expect(articlePage).toContain('.article-content iframe.youtube-shorts-embed');
    expect(articlePage).toContain('width: 100% !important;');
  });

  it('preserves youtube shorts iframe classes through article and comment sanitizers', () => {
    expect(articlePage).toContain("'class'");
    expect(sanitizeArticleContent).toContain("'class'");
    expect(commentEmbeder).toContain('class="youtube-shorts-embed"');
    expect(commentEmbeder).toContain("const wrapperWidth = isShorts ? '100%; max-width: 315px' : width");
    expect(articlePage).toContain('.youtube-shorts-wrapper');
  });
});

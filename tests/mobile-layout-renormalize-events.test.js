import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const layout = readFileSync('src/routes/+layout.svelte', 'utf8');
const writePage = readFileSync(
  'src/routes/board/[boardId=boardId]/write/[[articleId]]/+page.svelte',
  'utf8'
);
const articlePage = readFileSync(
  'src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.svelte',
  'utf8'
);

describe('mobile layout width renormalization events', () => {
  it('lets child pages request mobile layout width normalization', () => {
    expect(layout).toContain("window.addEventListener('dgst:normalize-mobile-layout-width'");
    expect(layout).toContain("window.removeEventListener('dgst:normalize-mobile-layout-width'");
    expect(layout).toContain('function scheduleMobileLayoutWidthNormalization()');
    expect(layout).toContain('setTimeout(scheduleMobileLayoutWidthNormalization, 120)');
    expect(layout).toContain('setTimeout(scheduleMobileLayoutWidthNormalization, 360)');
  });

  it('requests width normalization after a successful article write', () => {
    expect(writePage).toContain("window.dispatchEvent(new CustomEvent('dgst:normalize-mobile-layout-width'))");
    expect(writePage).toContain('await goto(resolve(`/board/${boardId}/${savedArticleId}`));');
    expect(writePage.lastIndexOf('requestMobileLayoutWidthNormalization();')).toBeGreaterThan(
      writePage.indexOf('await goto(resolve(`/board/${boardId}/${savedArticleId}`));')
    );
  });

  it('requests width normalization after comment data is refreshed', () => {
    expect(articlePage).toContain("import { onMount, tick } from 'svelte';");
    expect(articlePage).toContain('async function comments()');
    expect(articlePage).toContain('await comments();');
    expect(articlePage).toContain("window.dispatchEvent(new CustomEvent('dgst:normalize-mobile-layout-width'))");
    expect(articlePage.indexOf("window.dispatchEvent(new CustomEvent('dgst:normalize-mobile-layout-width'))")).toBeGreaterThan(
      articlePage.indexOf('commentData = d;')
    );
  });
});

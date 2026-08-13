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
    expect(layout).toContain('function resetHorizontalScrollPositions()');
    expect(layout).toContain('document.documentElement,');
    expect(layout).toContain('element.scrollLeft = 0');
    expect(layout).not.toContain("document.querySelectorAll('*')");
    expect(layout).toContain('top: window.scrollY');
    expect(layout).toContain("window.dispatchEvent(new Event('resize'))");
    expect(layout).toContain('requestAnimationFrame(() =>');
    expect(layout).toContain('clearTimeout(mobileLayoutNormalizationTimer)');
    expect(layout).toMatch(
      /mobileLayoutNormalizationTimer = window\.setTimeout\([\s\S]*?window\.dispatchEvent\(new Event\('resize'\)\);[\s\S]*?}, 180\)/
    );
    expect(layout).toContain('}, 180)');
  });

  it('relies on the global afterNavigate normalization after a successful article write', () => {
    expect(writePage).toContain('await goto(resolve(`/board/${boardId}/${savedArticleId}`));');
    expect(writePage).not.toContain('requestMobileLayoutWidthNormalization');
  });

  it('requests width normalization after comment data is refreshed', () => {
    expect(articlePage).toMatch(/import\s+\{[^}]*\bonMount\b[^}]*\btick\b[^}]*\}\s+from 'svelte';/);
    expect(articlePage).toContain('async function comments()');
    expect(articlePage).toContain('await comments();');
    expect(articlePage).toContain(
      "window.dispatchEvent(new CustomEvent('dgst:normalize-mobile-layout-width'))"
    );
    expect(
      articlePage.indexOf(
        "window.dispatchEvent(new CustomEvent('dgst:normalize-mobile-layout-width'))"
      )
    ).toBeGreaterThan(articlePage.indexOf('commentData = d;'));
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const articlePage = readFileSync(
  'src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.svelte',
  'utf8'
);

describe('article list navigation scroll reset', () => {
  it('forces the list page to the top after client-side navigation', () => {
    expect(articlePage).toMatch(
      /async function list\(\)[\s\S]*?await goto\([\s\S]*?replaceState: true[\s\S]*?window\.scrollTo\(\{ top: 0, left: 0, behavior: 'auto' \}\);/
    );
  });
});

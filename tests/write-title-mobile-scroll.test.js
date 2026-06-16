import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const writePage = readFileSync(
  'src/routes/board/[boardId=boardId]/write/[[articleId]]/+page.svelte',
  'utf8'
);

describe('write page mobile title positioning', () => {
  it('keeps the title field visible after mobile layout and browser scroll restoration settle', () => {
    expect(writePage).toContain('keepWriteTitleVisible');
    expect(writePage).toContain("import { onMount, tick } from 'svelte'");
    expect(writePage).toContain('await tick();');
    expect(writePage).toContain('getBoundingClientRect');
    expect(writePage).toContain('window.scrollTo({');
    expect(writePage).toContain('setTimeout(keepWriteTitleVisible');
    expect(writePage).not.toContain("block: 'start'");
    expect(writePage).not.toContain('titleInput.focus');
  });
});

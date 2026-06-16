import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const writePage = readFileSync(
  'src/routes/board/[boardId=boardId]/write/[[articleId]]/+page.svelte',
  'utf8'
);

describe('write page mobile title positioning', () => {
  it('does not auto-focus or align the title field to the viewport top on mount', () => {
    expect(writePage).not.toContain("block: 'start'");
    expect(writePage).toContain("block: 'center'");
    expect(writePage).not.toContain('titleInput.focus');
  });
});

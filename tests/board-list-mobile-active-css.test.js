import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const boardList = readFileSync('src/lib/components/board_list.svelte', 'utf8');

describe('board list mobile tap feedback CSS', () => {
  it('gives mobile article rows an active pressed state', () => {
    expect(boardList).toContain('@media (hover: none) and (pointer: coarse)');
    expect(boardList).toContain('.board-list-row:active');
    expect(boardList).toContain('background-color: var(--bs-tertiary-bg)');
    expect(boardList).toContain('.board-list-link:active');
  });
});

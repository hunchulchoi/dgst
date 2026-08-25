import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('board list preload policy', () => {
  it('does not start route data fetches from hover alone', () => {
    const source = readFileSync('src/lib/components/board_list.svelte', 'utf8');

    expect(source).not.toContain('data-sveltekit-preload-data="hover"');
    expect(source).toContain('data-sveltekit-preload-data="tap"');
  });
});

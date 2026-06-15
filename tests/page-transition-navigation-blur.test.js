import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const layout = readFileSync('src/routes/+layout.svelte', 'utf8');

describe('page transition navigation blur', () => {
  it('applies visible blur immediately while board detail navigation is pending', () => {
    expect(layout).toContain('page-transition-navigating');
    expect(layout).toContain('class:page-transition-navigating={boardListToDetailBlur}');
    expect(layout).toContain('filter: blur(3px)');
  });
});

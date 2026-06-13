import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('global stylesheet', () => {
  it('does not use Svelte :global selectors in app.css', () => {
    const css = readFileSync('src/app.css', 'utf8');

    expect(css).not.toContain(':global(');
  });
});

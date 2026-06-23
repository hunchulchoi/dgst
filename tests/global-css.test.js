import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('global stylesheet', () => {
  it('does not use Svelte :global selectors in app.css', () => {
    const css = readFileSync('src/app.css', 'utf8');

    expect(css).not.toContain(':global(');
  });

  it('styles rich text links as visible blue underlined links', () => {
    const css = readFileSync('src/app.css', 'utf8');

    expect(css).toContain('.dgst-rich-text a,');
    expect(css).toContain('.markdown-body a {');
    expect(css).toContain('color: #0366d6;');
    expect(css).toContain('text-decoration: underline;');
  });
});

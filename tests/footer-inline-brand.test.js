import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const footer = readFileSync('src/lib/components/footer.svelte', 'utf8');

describe('footer brand line', () => {
  it('keeps the logo and copyright on one line', () => {
    expect(footer).toContain('footer-brand-line');
    expect(footer).not.toContain('flex-column');
    expect(footer).toMatch(
      /footer-brand-line[\s\S]*logo_transparent_100\.png[\s\S]*© 2023[\s\S]*<\/div>/
    );
  });
});

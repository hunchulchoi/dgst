import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('mobile layout viewport clamp', () => {
  it('does not clamp app width to visualViewport-derived CSS variables', () => {
    const layout = readFileSync('src/routes/+layout.svelte', 'utf8');

    expect(layout).not.toContain('dgst-mobile-viewport-width');
    expect(layout).not.toContain('visualViewport?.width');
  });
});

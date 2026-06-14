import { describe, expect, it } from 'vitest';

import { computeMobileLayoutWidth } from '../src/lib/util/mobileLayoutWidth.js';

describe('mobile layout width', () => {
  it('uses the layout viewport width when browser zoom shrinks visualViewport width', () => {
    expect(
      computeMobileLayoutWidth({
        innerWidth: 390,
        visualViewportWidth: 280
      })
    ).toBe(390);
  });

  it('falls back to visualViewport width when innerWidth is not available', () => {
    expect(
      computeMobileLayoutWidth({
        innerWidth: 0,
        visualViewportWidth: 320
      })
    ).toBe(320);
  });
});

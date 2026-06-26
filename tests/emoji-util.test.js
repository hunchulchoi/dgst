import { describe, expect, it } from 'vitest';

import { countEmojis, isOnlyOneEmoji } from '../src/lib/util/emoji.js';

describe('emoji utilities', () => {
  it('detects recently added single emoji characters', () => {
    expect(countEmojis('🫡')).toBe(1);
    expect(isOnlyOneEmoji('🫡')).toBe(true);
  });

  it('treats emoji modifier and ZWJ sequences as one emoji', () => {
    expect(countEmojis('👋🏽')).toBe(1);
    expect(isOnlyOneEmoji('👨‍💻')).toBe(true);
  });

  it('rejects mixed text and multiple emoji for single emoji rendering', () => {
    expect(isOnlyOneEmoji('hi 🫡')).toBe(false);
    expect(isOnlyOneEmoji('🫡🫡')).toBe(false);
  });
});

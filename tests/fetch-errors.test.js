import { describe, expect, it } from 'vitest';

import { isInterruptedFetchError } from '../src/lib/util/fetchErrors.js';

describe('isInterruptedFetchError', () => {
  it('matches browser fetch interruption errors', () => {
    expect(isInterruptedFetchError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isInterruptedFetchError(new TypeError('Load failed'))).toBe(true);
    expect(isInterruptedFetchError(new DOMException('The operation was aborted.', 'AbortError'))).toBe(
      true
    );
  });

  it('does not match unrelated errors', () => {
    expect(isInterruptedFetchError(new Error('database failed'))).toBe(false);
    expect(isInterruptedFetchError('Failed to fetch')).toBe(false);
  });
});

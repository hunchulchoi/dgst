import { describe, expect, it } from 'vitest';

import {
  SESSION_ABSOLUTE_MAX_AGE_SECONDS,
  capSessionExpiry,
  getSessionAbsoluteExpiry,
  isSessionAbsolutelyExpired
} from '../src/lib/server/auth/sessionPolicy.js';

describe('session absolute expiry policy', () => {
  const createdAt = new Date('2026-01-01T00:00:00.000Z');

  it('sets the absolute deadline to 90 days after issuance', () => {
    expect(SESSION_ABSOLUTE_MAX_AGE_SECONDS).toBe(90 * 24 * 60 * 60);
    expect(getSessionAbsoluteExpiry(createdAt)).toEqual(new Date('2026-04-01T00:00:00.000Z'));
  });

  it('expires at the 90-day boundary even if the idle expiry is later', () => {
    expect(isSessionAbsolutelyExpired({ createdAt }, new Date('2026-03-31T23:59:59.999Z'))).toBe(
      false
    );
    expect(isSessionAbsolutelyExpired({ createdAt }, new Date('2026-04-01T00:00:00.000Z'))).toBe(
      true
    );
  });

  it('caps rolling idle expiry at the absolute deadline', () => {
    expect(capSessionExpiry(new Date('2026-04-15T00:00:00.000Z'), createdAt)).toEqual(
      new Date('2026-04-01T00:00:00.000Z')
    );
    expect(capSessionExpiry(new Date('2026-02-01T00:00:00.000Z'), createdAt)).toEqual(
      new Date('2026-02-01T00:00:00.000Z')
    );
  });

  it('treats missing or invalid issuance timestamps as unverifiable', () => {
    expect(getSessionAbsoluteExpiry(undefined)).toBeUndefined();
    expect(getSessionAbsoluteExpiry('invalid')).toBeUndefined();
    expect(isSessionAbsolutelyExpired({}, new Date())).toBe(false);
  });
});

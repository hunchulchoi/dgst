import { describe, expect, it } from 'vitest';
import {
  getSessionDeviceMismatch,
  getUserAgentFingerprint
} from '../src/lib/server/auth/checkSessionDevice.js';

describe('session device mismatch detection', () => {
  it('ignores browser version-only user-agent changes', () => {
    const storedUserAgent =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.4 Mobile/15E148 Safari/604.1';
    const currentUserAgent =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1';

    expect(getUserAgentFingerprint(storedUserAgent)).toEqual(
      getUserAgentFingerprint(currentUserAgent)
    );
    expect(
      getSessionDeviceMismatch(
        { deviceId: 'same-device', userAgent: storedUserAgent },
        { deviceId: 'same-device', userAgent: currentUserAgent }
      )
    ).toBeNull();
  });

  it('detects device id changes even when user-agent is stable', () => {
    const userAgent =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_5_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/148.0.7778.166 Mobile/15E148 Safari/604.1';

    expect(
      getSessionDeviceMismatch(
        { deviceId: 'stored-device', userAgent },
        { deviceId: 'current-device', userAgent }
      )
    ).toEqual(['deviceId']);
  });

  it('detects browser family changes on the same device', () => {
    const safari =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1';
    const chrome =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/148.0.7778.166 Mobile/15E148 Safari/604.1';

    expect(
      getSessionDeviceMismatch(
        { deviceId: 'same-device', userAgent: safari },
        { deviceId: 'same-device', userAgent: chrome }
      )
    ).toEqual(['userAgent']);
  });
});

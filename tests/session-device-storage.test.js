import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getJson: vi.fn(),
  setJson: vi.fn(),
  error: vi.fn(),
  warn: vi.fn()
}));

vi.mock('$lib/server/cache/pgCache.js', () => ({
  getJson: mocks.getJson,
  setJson: mocks.setJson
}));

vi.mock('$lib/util/logger.js', () => ({
  default: { error: mocks.error, warn: mocks.warn }
}));

const { checkAndLogSessionDevice } = await import('../src/lib/server/auth/checkSessionDevice.js');

const userAgent =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/26.5 Mobile/15E148 Safari/604.1';

function makeEvent() {
  return {
    cookies: {
      /** @param {string} name */
      get(name) {
        if (name.includes('session-token')) return 'session-secret';
        if (name === 'dgst_device') return 'device-secret';
        return undefined;
      }
    },
    request: new Request('https://www.dgst.me/', { headers: { 'user-agent': userAgent } })
  };
}

describe('session device storage minimization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setJson.mockResolvedValue(undefined);
  });

  it('stores only a coarse browser fingerprint instead of the full user-agent', async () => {
    mocks.getJson.mockResolvedValue(null);

    await checkAndLogSessionDevice(makeEvent());

    expect(mocks.setJson).toHaveBeenCalledWith(
      'session_device:session-secret',
      { deviceId: 'device-secret', userAgentFingerprint: 'ios:iphone:safari' },
      30 * 24 * 60 * 60,
      'device'
    );
  });

  it('does not include device identifiers or user-agent values in mismatch logs', async () => {
    mocks.getJson.mockResolvedValue({
      deviceId: 'previous-device-secret',
      userAgentFingerprint: 'windows:chrome'
    });

    await checkAndLogSessionDevice(makeEvent(), { action: 'board.write' });

    expect(mocks.error).toHaveBeenCalledWith({
      message: 'Session deviceId/UA mismatch (추이 관찰)',
      action: 'board.write',
      mismatchReasons: ['deviceId', 'userAgent']
    });
  });
});

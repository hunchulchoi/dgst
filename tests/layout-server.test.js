import { describe, expect, it, vi } from 'vitest';

const alarmService = vi.hoisted(() => ({
  getUnreadAlarmCount: vi.fn()
}));

const loggerModule = vi.hoisted(() => ({
  default: {
    warn: vi.fn()
  }
}));

const envModule = vi.hoisted(() => ({
  env: /** @type {Record<string, string | undefined>} */ ({})
}));

vi.mock('$env/dynamic/private', () => envModule);
vi.mock('$lib/server/alarm/alarmService.js', () => alarmService);
vi.mock('$lib/util/logger.js', () => loggerModule);

describe('+layout.server load', () => {
  it('includes the unread alarm count for the authenticated user', async () => {
    alarmService.getUnreadAlarmCount.mockResolvedValue(3);
    const { load } = await import('../src/routes/+layout.server.js');

    const event = /** @type {any} */ ({
      url: new URL('https://www.dgst.me/'),
      setHeaders: vi.fn(),
      locals: {
        auth: vi.fn().mockResolvedValue({
          user: {
            email: 'user@example.com',
            nickname: 'tester'
          }
        })
      }
    });
    const result = await load(event);

    expect(alarmService.getUnreadAlarmCount).toHaveBeenCalledWith('user@example.com');
    expect(result.unreadAlarmCount).toBe(3);
  });

  it('marks requests for the configured blue host', async () => {
    envModule.env.BLUE_DGST_HOST = 'blue.example.test';
    const { load } = await import('../src/routes/+layout.server.js');

    const event = /** @type {any} */ ({
      url: new URL('https://blue.example.test/'),
      setHeaders: vi.fn(),
      locals: {
        auth: vi.fn().mockResolvedValue(null)
      }
    });

    const result = await load(event);

    expect(result.isBlueDgstHost).toBe(true);
  });

  it('marks forwarded requests for the configured blue host', async () => {
    envModule.env.BLUE_DGST_HOST = 'blue.example.test';
    const { load } = await import('../src/routes/+layout.server.js');

    const event = /** @type {any} */ ({
      url: new URL('http://127.0.0.1:3000/'),
      request: {
        headers: new Headers({
          'x-forwarded-host': 'blue.example.test'
        })
      },
      setHeaders: vi.fn(),
      locals: {
        auth: vi.fn().mockResolvedValue(null)
      }
    });

    const result = await load(event);

    expect(result.isBlueDgstHost).toBe(true);
  });
});

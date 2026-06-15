import { describe, expect, it, vi } from 'vitest';

const alarmService = vi.hoisted(() => ({
  getUnreadAlarmCount: vi.fn()
}));

const loggerModule = vi.hoisted(() => ({
  default: {
    warn: vi.fn()
  }
}));

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
});

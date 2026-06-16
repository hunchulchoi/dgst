import { describe, expect, it, vi } from 'vitest';

const pgCache = vi.hoisted(() => ({
  getJson: vi.fn(),
  setJson: vi.fn(),
  del: vi.fn()
}));

vi.mock('$lib/server/cache/pgCache.js', () => pgCache);
vi.mock('$lib/database/prisma.js', () => ({
  getPrisma: vi.fn()
}));
vi.mock('$lib/util/logger.js', () => ({
  default: {
    warn: vi.fn()
  }
}));

describe('sessionCache', () => {
  it('caches session and user lookups for thirty minutes by default', async () => {
    pgCache.setJson.mockResolvedValue(undefined);

    const { setCachedSessionAndUser } = await import('../src/lib/server/auth/sessionCache.js');

    await setCachedSessionAndUser('token-1', {
      session: {
        sessionToken: 'token-1',
        userId: 'user-1',
        expires: new Date('2026-06-16T00:30:00.000Z')
      },
      user: {
        id: 'user-1',
        email: 'user@example.com',
        emailVerified: null
      }
    });

    expect(pgCache.setJson).toHaveBeenCalledWith(
      'session:token-1',
      expect.objectContaining({
        session: expect.objectContaining({
          expires: '2026-06-16T00:30:00.000Z'
        }),
        user: expect.objectContaining({
          id: 'user-1'
        })
      }),
      30 * 60,
      'session'
    );
  });
});

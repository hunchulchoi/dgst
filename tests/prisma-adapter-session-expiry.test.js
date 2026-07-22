import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const base = {
    getUser: vi.fn(),
    getUserByEmail: vi.fn(),
    updateUser: vi.fn(),
    linkAccount: vi.fn(),
    getSessionAndUser: vi.fn(),
    updateSession: vi.fn(),
    deleteSession: vi.fn()
  };
  return {
    base,
    prisma: { session: { findUnique: vi.fn() } },
    sessionCache: {
      getCachedSessionAndUser: vi.fn(),
      setCachedSessionAndUser: vi.fn(),
      invalidateSession: vi.fn(),
      invalidateSessionsForUser: vi.fn()
    }
  };
});

vi.mock('@auth/prisma-adapter', () => ({ PrismaAdapter: () => mocks.base }));
vi.mock('$lib/database/prisma.js', () => ({ getPrisma: () => mocks.prisma }));
vi.mock('$lib/server/auth/userCache.js', () => ({
  getCachedUserById: vi.fn(),
  getCachedUserByEmail: vi.fn(),
  setCachedUser: vi.fn(),
  invalidateUser: vi.fn()
}));
vi.mock('$lib/server/auth/sessionCache.js', () => mocks.sessionCache);
vi.mock('$lib/util/logger.js', () => ({ default: { warn: vi.fn() } }));

describe('Prisma auth adapter absolute session expiry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sessionCache.getCachedSessionAndUser.mockResolvedValue(null);
  });

  it('deletes a session whose 90-day absolute deadline has passed', async () => {
    const { getPrismaAdapter } = await import('../src/lib/server/auth/prismaAdapter.js');
    const adapter = getPrismaAdapter();
    mocks.base.getSessionAndUser.mockResolvedValue({
      session: {
        sessionToken: 'expired-token',
        userId: 'user-1',
        expires: new Date('2099-01-01T00:00:00.000Z'),
        createdAt: new Date('2020-01-01T00:00:00.000Z')
      },
      user: { id: 'user-1', state: 'registered' }
    });

    await expect(adapter.getSessionAndUser?.('expired-token')).resolves.toBeNull();
    expect(mocks.base.deleteSession).toHaveBeenCalledWith('expired-token');
    expect(mocks.sessionCache.setCachedSessionAndUser).not.toHaveBeenCalled();
  });

  it('caps a rolling session update at 90 days after issuance', async () => {
    const { getPrismaAdapter } = await import('../src/lib/server/auth/prismaAdapter.js');
    const adapter = getPrismaAdapter();
    mocks.prisma.session.findUnique.mockResolvedValue({
      createdAt: new Date('2098-01-01T00:00:00.000Z')
    });
    mocks.base.updateSession.mockImplementation(async (session) => session);

    await adapter.updateSession?.({
      sessionToken: 'active-token',
      expires: new Date('2098-05-01T00:00:00.000Z')
    });

    expect(mocks.base.updateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionToken: 'active-token',
        expires: new Date('2098-04-01T00:00:00.000Z')
      })
    );
    expect(mocks.sessionCache.invalidateSession).toHaveBeenCalledWith('active-token');
  });
});

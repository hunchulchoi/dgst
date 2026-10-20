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
    vi.resetAllMocks();
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

  it('treats concurrent expiry cleanup as an absent session', async () => {
    const { getPrismaAdapter } = await import('../src/lib/server/auth/prismaAdapter.js');
    mocks.base.getSessionAndUser.mockResolvedValue({
      session: { createdAt: new Date('2020-01-01'), expires: new Date('2099-01-01') },
      user: { id: 'user-1', state: 'registered' }
    });
    mocks.base.deleteSession.mockRejectedValue({ code: 'P2025' });

    await expect(getPrismaAdapter().getSessionAndUser?.('expired-token')).resolves.toBeNull();
  });

  it('allows repeated sign-out after the session row has disappeared', async () => {
    const { getPrismaAdapter } = await import('../src/lib/server/auth/prismaAdapter.js');
    mocks.base.deleteSession
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({ code: 'P2025' });

    await getPrismaAdapter().deleteSession?.('same-token');
    await expect(getPrismaAdapter().deleteSession?.('same-token')).resolves.toBeUndefined();
    expect(mocks.sessionCache.invalidateSession).toHaveBeenCalledTimes(2);
  });

  it('handles concurrent removal of a cached expired session', async () => {
    const { getPrismaAdapter } = await import('../src/lib/server/auth/prismaAdapter.js');
    mocks.sessionCache.getCachedSessionAndUser.mockResolvedValue({
      session: { createdAt: new Date('2020-01-01'), expires: new Date('2099-01-01') },
      user: { id: 'user-1', state: 'registered' }
    });
    mocks.base.deleteSession.mockRejectedValue({ code: 'P2025' });

    await expect(getPrismaAdapter().getSessionAndUser?.('expired-token')).resolves.toBeNull();
    expect(mocks.sessionCache.invalidateSession).toHaveBeenCalledWith('expired-token');
    expect(mocks.base.getSessionAndUser).not.toHaveBeenCalled();
  });

  it('does not suppress database failures during sign-out', async () => {
    const { getPrismaAdapter } = await import('../src/lib/server/auth/prismaAdapter.js');
    const failure = Object.assign(new Error('Database unavailable'), { code: 'P1001' });
    mocks.base.deleteSession.mockRejectedValue(failure);

    await expect(getPrismaAdapter().deleteSession?.('active-token')).rejects.toBe(failure);
  });

  it('propagates lookup outages instead of declaring a session invalid', async () => {
    const { getPrismaAdapter } = await import('../src/lib/server/auth/prismaAdapter.js');
    const failure = new Error('Database unavailable');
    mocks.base.getSessionAndUser.mockRejectedValue(failure);

    await expect(getPrismaAdapter().getSessionAndUser?.('active-token')).rejects.toBe(failure);
  });

  it('preserves the browser cookie through Auth.js on an outage, then recovers', async () => {
    const { getPrismaAdapter } = await import('../src/lib/server/auth/prismaAdapter.js');
    const { session } = await import('../node_modules/@auth/core/lib/actions/session.js');
    const { SessionStore, defaultCookies } =
      await import('../node_modules/@auth/core/lib/utils/cookie.js');
    const cookies = defaultCookies(false);
    const logger = { error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
    const sessionStore = new SessionStore(
      cookies.sessionToken,
      { 'authjs.session-token': 'active-token' },
      logger
    );
    const clean = vi.spyOn(sessionStore, 'clean');
    const options = /** @type {Parameters<typeof session>[0]} */ (
      /** @type {unknown} */ ({
        adapter: getPrismaAdapter(),
        session: { strategy: 'database', maxAge: 2592000, updateAge: 86400 },
        logger,
        callbacks: {
          /** @param {{ session: import('@auth/core/types').Session }} params */
          session: async (params) => params.session
        },
        events: {},
        cookies
      })
    );
    mocks.base.getSessionAndUser.mockRejectedValueOnce(new Error('Database unavailable'));

    const unavailable = await session(options, sessionStore, []);
    expect(unavailable.body).toBeNull();
    expect(unavailable.cookies).toEqual([]);
    expect(clean).not.toHaveBeenCalled();

    mocks.base.getSessionAndUser.mockResolvedValue({
      session: { createdAt: new Date(), expires: new Date(Date.now() + 2592000000) },
      user: { id: 'user-1', state: 'registered' }
    });
    const recovered = await session(options, sessionStore, []);
    expect(recovered.body).toMatchObject({ user: { id: 'user-1' } });
    expect(recovered.cookies).toEqual([expect.objectContaining({ value: 'active-token' })]);

    mocks.base.getSessionAndUser.mockResolvedValue(null);
    const missing = await session(options, sessionStore, []);
    expect(missing.body).toBeNull();
    expect(clean).toHaveBeenCalledTimes(1);
    expect(missing.cookies).toEqual([
      expect.objectContaining({
        name: 'authjs.session-token',
        value: '',
        options: expect.objectContaining({ maxAge: 0 })
      })
    ]);
  });
});

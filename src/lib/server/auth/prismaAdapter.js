/**
 * Prisma Adapter: 인증 데이터는 PostgreSQL, 회원/세션 조회는 pgCache 우선.
 */
import { PrismaAdapter } from '@auth/prisma-adapter';
import { getPrisma } from '$lib/database/prisma.js';
import * as userCache from '$lib/server/auth/userCache.js';
import * as sessionCache from '$lib/server/auth/sessionCache.js';
import { isDeniedAuthUser } from '$lib/server/auth/authPolicy.js';
import {
  capSessionExpiry,
  getSessionAbsoluteExpiry,
  isSessionAbsolutelyExpired
} from '$lib/server/auth/sessionPolicy.js';
import logger from '$lib/util/logger.js';

/** @type {import('@auth/core/adapters').Adapter | null} */
let cachedAdapter = null;

/**
 * @returns {import('@auth/core/adapters').Adapter}
 */
export function getPrismaAdapter() {
  if (cachedAdapter) return cachedAdapter;

  const base =
    /** @type {import('@auth/core/adapters').Adapter & Required<Pick<import('@auth/core/adapters').Adapter, 'getUser' | 'getUserByEmail' | 'updateUser' | 'linkAccount' | 'getSessionAndUser' | 'updateSession' | 'deleteSession'>>} */ (
      PrismaAdapter(getPrisma())
    );

  cachedAdapter = {
    ...base,
    async getUser(id) {
      const cached = await userCache.getCachedUserById(id);
      if (cached) return cached;
      const user = await base.getUser(id);
      if (user) await userCache.setCachedUser(user);
      return user;
    },
    async getUserByEmail(email) {
      const cached = await userCache.getCachedUserByEmail(email);
      if (cached) return cached;
      const user = await base.getUserByEmail(email);
      if (user) await userCache.setCachedUser(user);
      return user;
    },
    async updateUser(user) {
      const updated = await base.updateUser(user);
      await userCache.invalidateUser(user.id, updated?.email ?? user.email);
      await sessionCache.invalidateSessionsForUser(user.id);
      return updated;
    },
    linkAccount(account) {
      return base.linkAccount({
        userId: account.userId,
        type: account.type,
        provider: account.provider,
        providerAccountId: account.providerAccountId
      });
    },
    async getSessionAndUser(sessionToken) {
      try {
        const cached = await sessionCache.getCachedSessionAndUser(sessionToken);
        if (cached) {
          const absoluteExpiry = getSessionAbsoluteExpiry(
            /** @type {{ createdAt?: unknown }} */ (cached.session).createdAt
          );
          if (!absoluteExpiry) {
            await sessionCache.invalidateSession(sessionToken);
          } else if (
            isDeniedAuthUser(cached.user) ||
            isSessionAbsolutelyExpired(/** @type {{ createdAt?: unknown }} */ (cached.session))
          ) {
            await sessionCache.invalidateSession(sessionToken);
            await base.deleteSession(sessionToken);
            return null;
          } else {
            return cached;
          }
        }
        const result = await base.getSessionAndUser(sessionToken);
        if (
          result &&
          (!getSessionAbsoluteExpiry(
            /** @type {{ createdAt?: unknown }} */ (result.session).createdAt
          ) ||
            isDeniedAuthUser(result.user) ||
            isSessionAbsolutelyExpired(/** @type {{ createdAt?: unknown }} */ (result.session)))
        ) {
          await sessionCache.invalidateSession(sessionToken);
          await base.deleteSession(sessionToken);
          return null;
        }
        if (result) await sessionCache.setCachedSessionAndUser(sessionToken, result);
        return result;
      } catch (err) {
        logger.warn({
          message: '[auth] getSessionAndUser failed — treating as logged out',
          errorMessage: err instanceof Error ? err.message : String(err)
        });
        return null;
      }
    },
    async updateSession(session) {
      const stored = await getPrisma().session.findUnique({
        where: { sessionToken: session.sessionToken },
        select: { createdAt: true }
      });
      if (!stored) return null;

      if (isSessionAbsolutelyExpired(stored)) {
        await sessionCache.invalidateSession(session.sessionToken);
        await base.deleteSession(session.sessionToken);
        return null;
      }

      const expires = capSessionExpiry(session.expires, stored.createdAt);
      const updated = await base.updateSession({
        ...session,
        ...(expires && { expires })
      });
      await sessionCache.invalidateSession(session.sessionToken);
      return updated;
    },
    async deleteSession(sessionToken) {
      await sessionCache.invalidateSession(sessionToken);
      await base.deleteSession(sessionToken);
    }
  };

  return /** @type {import('@auth/core/adapters').Adapter} */ (cachedAdapter);
}

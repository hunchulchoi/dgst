/**
 * Prisma Adapter: 인증 데이터는 PostgreSQL, 회원/세션 조회는 pgCache 우선.
 */
import { PrismaAdapter } from '@auth/prisma-adapter';
import { getPrisma } from '$lib/database/prisma.js';
import * as userCache from '$lib/server/auth/userCache.js';
import * as sessionCache from '$lib/server/auth/sessionCache.js';
import logger from '$lib/util/logger.js';

/** @type {import('@auth/core/adapters').Adapter | null} */
let cachedAdapter = null;

/**
 * @returns {import('@auth/core/adapters').Adapter}
 */
export function getPrismaAdapter() {
  if (cachedAdapter) return cachedAdapter;

  const base = PrismaAdapter(getPrisma());

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
      await userCache.invalidateUser(user.id);
      return updated;
    },
    async getSessionAndUser(sessionToken) {
      try {
        const cached = await sessionCache.getCachedSessionAndUser(sessionToken);
        if (cached) return cached;
        const result = await base.getSessionAndUser(sessionToken);
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
    async deleteSession(sessionToken) {
      await sessionCache.invalidateSession(sessionToken);
      return base.deleteSession(sessionToken);
    }
  };

  return cachedAdapter;
}

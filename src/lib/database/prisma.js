import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import logger from '$lib/util/logger.js';

const globalForPrisma = globalThis;

/** @returns {PrismaClient} */
export function getPrisma() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to initialize Prisma');
  }

  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString })
    });
  }
  return globalForPrisma.prisma;
}

/** @returns {Promise<void>} */
export async function connectPrisma() {
  const client = getPrisma();
  await client.$connect();
  logger.info({ message: '[postgres] connected via Prisma' });
}

export default getPrisma;

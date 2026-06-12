import { PrismaClient } from '@prisma/client';
import logger from '$lib/util/logger.js';

const globalForPrisma = globalThis;

/** @returns {PrismaClient} */
export function getPrisma() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
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

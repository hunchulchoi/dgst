import { PrismaClient } from '@prisma/client';
import logger from '$lib/util/logger.js';

/** @type {PrismaClient | undefined} */
let prisma;

/** @returns {PrismaClient} */
export function getPrisma() {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

/** @returns {Promise<void>} */
export async function connectPrisma() {
  const client = getPrisma();
  await client.$connect();
  logger.info({ message: '[postgres] connected via Prisma' });
}

export default getPrisma;

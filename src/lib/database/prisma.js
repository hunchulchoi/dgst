import prismaPkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import logger from '$lib/util/logger.js';

const { PrismaClient } = prismaPkg;

const DEFAULT_SLOW_QUERY_THRESHOLD_MS = 500;
const DEFAULT_SLOW_QUERY_MAX_SQL_LENGTH = 4000;

/** @type {typeof globalThis & { prisma?: import('@prisma/client').PrismaClient }} */
const globalForPrisma = globalThis;

/**
 * @typedef {{
 *   query: string;
 *   params: string;
 *   duration: number;
 *   target?: string;
 *   timestamp?: Date;
 * }} PrismaQueryEvent
 */

/**
 * @param {string} name
 * @param {number} fallback
 * @returns {number}
 */
function numberFromEnv(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

/** @returns {number} */
function getSlowQueryThresholdMs() {
  return Math.max(0, numberFromEnv('SLOW_QUERY_THRESHOLD_MS', DEFAULT_SLOW_QUERY_THRESHOLD_MS));
}

/** @returns {number} */
function getSlowQueryMaxSqlLength() {
  return Math.max(200, numberFromEnv('SLOW_QUERY_MAX_SQL_LENGTH', DEFAULT_SLOW_QUERY_MAX_SQL_LENGTH));
}

/**
 * @param {string} value
 * @param {number} maxLength
 * @returns {string}
 */
function truncate(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

/**
 * @param {string} query
 * @returns {string}
 */
function normalizeSql(query) {
  return query.replace(/\s+/g, ' ').trim();
}

/**
 * @param {string} params
 * @returns {string}
 */
function summarizeQueryParams(params) {
  if (process.env.LOG_SLOW_QUERY_PARAMS === 'true') {
    return truncate(params, 2000);
  }

  try {
    const parsed = JSON.parse(params);
    if (Array.isArray(parsed)) {
      return `[redacted:${parsed.length}]`;
    }
  } catch {
    // Prisma params are JSON strings in normal operation; keep fallback safe if parsing fails.
  }

  return params ? '[redacted]' : '';
}

/**
 * @param {import('@prisma/client').PrismaClient} client
 * @returns {void}
 */
function attachSlowQueryLogging(client) {
  const thresholdMs = getSlowQueryThresholdMs();
  if (thresholdMs <= 0) {
    return;
  }

  const queryClient =
    /** @type {import('@prisma/client').PrismaClient & { $on: (event: 'query', callback: (event: PrismaQueryEvent) => void) => void }} */ (
      client
    );

  queryClient.$on('query', (queryEvent) => {
    const durationMs = Number(queryEvent.duration);
    if (!Number.isFinite(durationMs) || durationMs < thresholdMs) {
      return;
    }

    logger.warn({
      message: '[postgres] slow query',
      event: 'postgres.slow_query',
      duration_ms: durationMs,
      threshold_ms: thresholdMs,
      target: queryEvent.target,
      query: truncate(normalizeSql(queryEvent.query), getSlowQueryMaxSqlLength()),
      params: summarizeQueryParams(queryEvent.params)
    });
  });
}

/** @returns {import('@prisma/client').PrismaClient} */
export function getPrisma() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to initialize Prisma');
  }

  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient(
      /** @type {ConstructorParameters<typeof PrismaClient>[0]} */ ({
        adapter: new PrismaPg({ connectionString }),
        log: [{ emit: 'event', level: 'query' }]
      })
    );
    attachSlowQueryLogging(globalForPrisma.prisma);
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

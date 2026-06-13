import { connectPrisma } from '$lib/database/prisma.js';
import { isAvailable, purgeExpired } from '$lib/server/cache/pgCache.js';
import logger from '$lib/util/logger.js';
import { traceFromUnknown } from '$lib/util/formatErrorTrace.js';

let started = false;

/**
 * 앱 프로세스 기동 후 Postgres·pgCache 연결을 미리 수립 (첫 요청 cold start 완화).
 */
export function warmupConnections() {
  if (started) return;
  started = true;

  void connectPrisma().catch((err) => {
    logger.error({
      message: '[warmup] postgres connect failed',
      subsystem: 'postgres',
      trace: traceFromUnknown(err)
    });
  });

  void isAvailable();

  setInterval(() => purgeExpired(), 5 * 60 * 1000);
}

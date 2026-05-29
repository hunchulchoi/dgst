import connectDB from '$lib/database/mongoosePriomise.js';
import clientPromise from '$lib/database/clientPromise.js';
import * as redis from '$lib/server/redis/client.js';
import logger from '$lib/util/logger.js';
import { traceFromUnknown } from '$lib/util/formatErrorTrace.js';

let started = false;

/**
 * 앱 프로세스 기동 후 MongoDB·Redis 연결을 미리 수립 (첫 요청 cold start 완화).
 */
export function warmupConnections() {
  if (started) return;
  started = true;

  void connectDB().catch((err) => {
    logger.error({
      message: '[warmup] mongo connect failed',
      subsystem: 'mongo',
      trace: traceFromUnknown(err)
    });
  });

  /** Auth adapter·login_logs — Mongoose와 동일 풀 */
  void clientPromise.catch((err) => {
    logger.error({
      message: '[warmup] mongo shared client failed',
      subsystem: 'mongo',
      trace: traceFromUnknown(err)
    });
  });

  void redis.getClient().then((c) => {
    if (!c) {
      logger.warn({
        message: '[warmup] redis unavailable after getClient',
        subsystem: 'redis'
      });
    }
  });
}

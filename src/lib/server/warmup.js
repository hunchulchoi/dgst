import connectDB from '$lib/database/mongoosePriomise.js';
import clientPromise from '$lib/database/clientPromise.js';
import * as redis from '$lib/server/redis/client.js';

let started = false;

/**
 * 앱 프로세스 기동 후 MongoDB·Redis 연결을 미리 수립 (첫 요청 cold start 완화).
 */
export function warmupConnections() {
  if (started) return;
  started = true;

  void connectDB().catch(() => {});
  void clientPromise.catch(() => {});
  void redis.getClient().catch(() => {});
}

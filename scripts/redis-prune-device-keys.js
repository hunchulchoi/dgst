/**
 * dgst:device:* 키 일괄 삭제 (SCAN — KEYS 사용 안 함)
 *
 * 사용: REDIS_URL=redis://... node scripts/redis-prune-device-keys.js
 * dry-run: DRY_RUN=1 node scripts/redis-prune-device-keys.js
 */
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL;
const DRY_RUN = process.env.DRY_RUN === '1';
const PATTERN = process.env.PATTERN || 'dgst:device:*';
const SCAN_COUNT = 500;

if (!REDIS_URL) {
  console.error('REDIS_URL required');
  process.exit(1);
}

const redis = new Redis(REDIS_URL);

/** @param {string[]} keys */
async function deleteBatch(keys) {
  if (keys.length === 0) return 0;
  if (DRY_RUN) return keys.length;
  return redis.del(...keys);
}

async function main() {
  let cursor = '0';
  let scanned = 0;
  let deleted = 0;

  console.log(`Pattern: ${PATTERN}${DRY_RUN ? ' (DRY RUN)' : ''}`);

  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', PATTERN, 'COUNT', SCAN_COUNT);
    cursor = next;
    scanned += keys.length;
    deleted += await deleteBatch(keys);

    if (scanned > 0 && scanned % 5000 === 0) {
      console.log(`… scanned ${scanned}, deleted ${deleted}`);
    }
  } while (cursor !== '0');

  const dbsize = await redis.dbsize();
  console.log(`Done. matched=${scanned} deleted=${deleted} dbsize=${dbsize}`);
  await redis.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

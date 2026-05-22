/**
 * TTL 없는(영구) 키 삭제 — SCAN + TTL -1
 *
 * 기본: dgst:* 만 대상. 전체 DB는 PATTERN=* (주의)
 *
 * dry-run: DRY_RUN=1 REDIS_URL=... node scripts/redis-prune-no-ttl.js
 * 알림만: PATTERN=dgst:alarms:* node scripts/redis-prune-no-ttl.js
 */
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL;
const DRY_RUN = process.env.DRY_RUN === '1';
const PATTERN = process.env.PATTERN || 'dgst:*';
const SCAN_COUNT = 500;

if (!REDIS_URL) {
  console.error('REDIS_URL required');
  process.exit(1);
}

const redis = new Redis(REDIS_URL);

/** @param {string[]} keys */
async function deleteKeys(keys) {
  if (keys.length === 0) return 0;
  if (DRY_RUN) return keys.length;
  return redis.del(...keys);
}

async function main() {
  let cursor = '0';
  let scanned = 0;
  let noTtl = 0;
  let deleted = 0;

  console.log(`Pattern: ${PATTERN}${DRY_RUN ? ' (DRY RUN)' : ''}`);

  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', PATTERN, 'COUNT', SCAN_COUNT);
    cursor = next;

    /** @type {string[]} */
    const toDelete = [];
    for (const k of keys) {
      scanned += 1;
      const ttl = await redis.ttl(k);
      if (ttl === -1) {
        noTtl += 1;
        toDelete.push(k);
      }
    }

    deleted += await deleteKeys(toDelete);

    if (scanned > 0 && scanned % 10000 === 0) {
      console.log(`… scanned ${scanned}, noTTL ${noTtl}, deleted ${deleted}`);
    }
  } while (cursor !== '0');

  const dbsize = await redis.dbsize();
  console.log(`Done. scanned=${scanned} noTTL=${noTtl} deleted=${deleted} dbsize=${dbsize}`);
  await redis.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

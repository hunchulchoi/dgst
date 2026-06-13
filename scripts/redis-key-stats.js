/**
 * Redis 키 prefix별 개수 집계 (SCAN — KEYS 사용 안 함)
 *
 * 사용: REDIS_URL=redis://... node scripts/redis-key-stats.js
 */
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL;
const SCAN_COUNT = 1000;
const SAMPLE = Number(process.env.SAMPLE || 0);

if (!REDIS_URL) {
  console.error('REDIS_URL required');
  process.exit(1);
}

const redis = new Redis(REDIS_URL);

/** @param {string} key */
function bucketKey(key) {
  if (key.startsWith('dgst:')) {
    const rest = key.slice(5);
    const parts = rest.split(':');
    if (parts.length >= 2) return `dgst:${parts[0]}:${parts[1]}:*`;
    if (parts.length === 1) return `dgst:${parts[0]}:*`;
    return 'dgst:*';
  }

  const idx = key.indexOf(':');
  if (idx === -1) return key;
  const head = key.slice(0, idx);
  const tail = key.slice(idx + 1);
  const sub = tail.split(':')[0];
  return `${head}:${sub}:*`;
}

async function main() {
  /** @type {Map<string, number>} */
  const counts = new Map();
  /** @type {Map<string, { noTtl: number; withTtl: number }>} */
  const ttlStats = new Map();
  let total = 0;
  let cursor = '0';

  do {
    const [next, keys] = await redis.scan(cursor, 'COUNT', SCAN_COUNT);
    cursor = next;

    for (const k of keys) {
      total += 1;
      const bucket = bucketKey(k);
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);

      if (SAMPLE > 0 && total <= SAMPLE) {
        const ttl = await redis.ttl(k);
        const entry = ttlStats.get(bucket) ?? { noTtl: 0, withTtl: 0 };
        if (ttl === -1) entry.noTtl += 1;
        else entry.withTtl += 1;
        ttlStats.set(bucket, entry);
      }
    }

    if (total % 20000 === 0) {
      console.log(`… scanned ${total}`);
    }
  } while (cursor !== '0');

  const dbsize = await redis.dbsize();
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  console.log(`\nDBSIZE=${dbsize} scanned=${total}\n`);
  console.log('prefix (top 30)\tcount');
  for (const [prefix, count] of sorted.slice(0, 30)) {
    const ttl = ttlStats.get(prefix);
    const ttlNote =
      ttl && SAMPLE > 0
        ? `\t(noTTL=${ttl.noTtl}, hasTTL=${ttl.withTtl})`
        : '';
    console.log(`${prefix}\t${count}${ttlNote}`);
  }

  if (sorted.length > 30) {
    console.log(`… +${sorted.length - 30} more prefixes`);
  }

  await redis.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

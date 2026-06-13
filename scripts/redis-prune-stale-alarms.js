/**
 * 오래된 알림 키 정리
 * - alarms:data — updatedAt 3일 초과 또는 TTL 없음 → 삭제
 * - alarms:list ZSET — 멤버별 hash 없으면 제거, 빈 ZSET 삭제
 *
 * DRY_RUN=1 REDIS_URL=... node scripts/redis-prune-stale-alarms.js
 */
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL;
const DRY_RUN = process.env.DRY_RUN === '1';
const PREFIX = process.env.REDIS_PREFIX || 'dgst:';
const MAX_AGE_MS = Number(process.env.MAX_AGE_DAYS || 3) * 24 * 60 * 60 * 1000;
const SCAN_COUNT = 200;

if (!REDIS_URL) {
  console.error('REDIS_URL required');
  process.exit(1);
}

const redis = new Redis(REDIS_URL);

/** @param {string[]} keys */
async function delKeys(keys) {
  if (keys.length === 0) return 0;
  if (DRY_RUN) return keys.length;
  return redis.del(...keys);
}

async function pruneDataKeys() {
  let cursor = '0';
  let scanned = 0;
  let stale = 0;
  let deleted = 0;
  const pattern = `${PREFIX}alarms:data:*`;

  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', SCAN_COUNT);
    cursor = next;

    /** @type {string[]} */
    const toDelete = [];

    for (const k of keys) {
      scanned += 1;
      const ttl = await redis.ttl(k);
      if (ttl === -1) {
        toDelete.push(k);
        stale += 1;
        continue;
      }

      const raw = await redis.get(k);
      if (!raw) continue;

      try {
        const alarm = JSON.parse(raw);
        const updatedAt = alarm.updatedAt || alarm.createdAt;
        if (updatedAt && Date.now() - Date.parse(updatedAt) > MAX_AGE_MS) {
          toDelete.push(k);
          stale += 1;
        }
      } catch {
        toDelete.push(k);
        stale += 1;
      }
    }

    deleted += await delKeys(toDelete);

    if (scanned % 5000 === 0 && scanned > 0) {
      console.log(`[data] scanned=${scanned} stale=${stale} deleted=${deleted}`);
    }
  } while (cursor !== '0');

  console.log(`[data] done scanned=${scanned} stale=${stale} deleted=${deleted}`);
  return deleted;
}

async function pruneListZsets() {
  let cursor = '0';
  let zsets = 0;
  let removedMembers = 0;
  let deletedZsets = 0;
  const pattern = `${PREFIX}alarms:list:*`;

  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', SCAN_COUNT);
    cursor = next;

    for (const zsetKey of keys) {
      zsets += 1;
      const members = await redis.zrange(zsetKey, 0, -1);
      if (members.length === 0) {
        deletedZsets += await delKeys([zsetKey]);
        continue;
      }

      for (const member of members) {
        const dataKey = `${PREFIX}alarms:data:${member}`;
        const exists = await redis.exists(dataKey);
        if (!exists) {
          if (!DRY_RUN) await redis.zrem(zsetKey, member);
          removedMembers += 1;
        }
      }

      const remaining = await redis.zcard(zsetKey);
      if (remaining === 0) {
        deletedZsets += await delKeys([zsetKey]);
      } else if (!DRY_RUN) {
        await redis.expire(zsetKey, 60 * 60 * 24 * 3);
      }
    }
  } while (cursor !== '0');

  console.log(
    `[list] zsets=${zsets} orphanMembers=${removedMembers} emptyZsetsDeleted=${deletedZsets}`
  );
}

async function main() {
  console.log(
    `${DRY_RUN ? '(DRY RUN) ' : ''}Prune stale alarms (max age ${MAX_AGE_MS / 86400000}d)`
  );
  await pruneDataKeys();
  await pruneListZsets();
  console.log(`DBSIZE=${await redis.dbsize()}`);
  await redis.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

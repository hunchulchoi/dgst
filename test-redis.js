import { getClient, key, getJson, REDIS_PREFIX } from './src/lib/server/redis/client.js';

async function run() {
  const client = await getClient();
  if (!client) {
    console.log("No redis client");
    return;
  }
  const keys = await client.keys(REDIS_PREFIX + 'alarms:list:*');
  console.log("Keys:", keys);
  for (const k of keys) {
     const items = await client.zrevrange(k, 0, -1);
     console.log("Items for", k, items);
     for (const id of items) {
       const hk = REDIS_PREFIX + 'alarms:data:' + id;
       const v = await client.get(hk);
       console.log("  hk:", hk, "v:", v);
     }
  }
  process.exit(0);
}
run().catch(console.error);

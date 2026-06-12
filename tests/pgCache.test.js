import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPrisma } from '../src/lib/database/prisma.js';
import * as pgCache from '../src/lib/server/cache/pgCache.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);
const NS = 'test';
const KEY = 'unit:' + Date.now();

describe.skipIf(!hasDatabase)('pgCache', () => {
  beforeAll(async () => {
    await getPrisma().$connect();
  });

  afterAll(async () => {
    await pgCache.delByPrefix('unit:', NS);
    await pgCache.delByPrefix('pfx:', NS);
    await getPrisma().$disconnect();
  });

  it('setJson and getJson round-trip', async () => {
    const payload = { foo: 'bar', n: 1 };
    const ok = await pgCache.setJson(KEY, payload, 60, NS);
    expect(ok).toBe(true);
    const got = await pgCache.getJson(KEY, NS);
    expect(got).toEqual(payload);
  });

  it('returns null after expiry', async () => {
    const k = KEY + ':exp';
    await pgCache.setJson(k, { x: 1 }, 1, NS);
    await new Promise((r) => setTimeout(r, 1100));
    const got = await pgCache.getJson(k, NS);
    expect(got).toBeNull();
  });

  it('delByPrefix removes matching keys', async () => {
    await pgCache.setJson('pfx:a', { a: 1 }, 60, NS);
    await pgCache.setJson('pfx:b', { b: 1 }, 60, NS);
    await pgCache.delByPrefix('pfx:', NS);
    expect(await pgCache.getJson('pfx:a', NS)).toBeNull();
    expect(await pgCache.getJson('pfx:b', NS)).toBeNull();
  });
});

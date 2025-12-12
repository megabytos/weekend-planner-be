import { CacheService } from '../cache.service.js';
import type { FastifyInstance } from 'fastify';

class InMemoryRedis {
  store = new Map<string, string>();
  sets = new Map<string, Set<string>>();
  expiry = new Map<string, number>();

  private isExpired(key: string) {
    const t = this.expiry.get(key);
    return t != null && Date.now() > t;
  }

  private prune(key: string) {
    if (this.isExpired(key)) {
      this.store.delete(key);
      this.expiry.delete(key);
      // we do not auto-delete from sets here
      return true;
    }
    return false;
  }

  async get(key: string) {
    this.prune(key);
    return this.store.get(key) ?? null;
  }
  async set(key: string, val: string, mode?: string, ttl?: number, cond?: string) {
    // Support patterns:
    // - set(key,val)
    // - set(key,val,'EX',seconds)
    // - set(key,val,'EX',seconds,'NX')
    // - set(key,val,'EX',seconds,'XX') (not used here)
    const hasEx = mode === 'EX';
    const ttlSec = hasEx ? (ttl as unknown as number) ?? 0 : 0;
    const condition = (cond as unknown as string) || undefined; // 'NX' or 'XX'

    // Handle NX/XX conditions
    const exists = this.store.has(key);
    if (condition === 'NX' && exists) {
      return null; // mimic ioredis: return null when NX and key exists
    }
    if (condition === 'XX' && !exists) {
      return null; // XX requires existing key
    }

    this.store.set(key, val);
    this.expiry.delete(key);
    if (hasEx && ttlSec > 0) {
      this.expiry.set(key, Date.now() + ttlSec * 1000);
    }
    return 'OK';
  }
  async del(...keys: string[]) {
    let c = 0;
    for (const k of keys) {
      if (this.store.delete(k)) c++;
      this.expiry.delete(k);
    }
    return c;
  }
  async sadd(key: string, member: string) {
    let s = this.sets.get(key);
    if (!s) { s = new Set(); this.sets.set(key, s); }
    s.add(member);
    return 1;
  }
  async smembers(key: string) {
    const s = this.sets.get(key);
    return s ? Array.from(s) : [];
  }
  async expire(key: string, seconds: number) {
    if (!this.store.has(key) && !this.sets.has(key)) return 0;
    this.expiry.set(key, Date.now() + seconds * 1000);
    return 1;
  }
  async exists(key: string) {
    this.prune(key);
    return this.store.has(key) ? 1 : 0;
  }
  async scan(cursor: string, _match: string, pattern: string, _count: string, _n: number) {
    // simple one-shot scan: return all keys matching pattern
    const glob = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    const keys = Array.from(this.store.keys()).filter((k) => glob.test(k));
    return ['0', keys];
  }
}

function mockAppWithRedis(): FastifyInstance {
  return { redis: new InMemoryRedis() } as unknown as FastifyInstance;
}

describe('CacheService', () => {
  it('set/get JSON and tag invalidate', async () => {
    const app = mockAppWithRedis();
    const cache = new CacheService(app);
    const key = cache.buildKey('test', { a: 1 });
    await cache.setJSON(key, { ok: true }, { ttlSeconds: 60, tags: ['city:1:search'] });
    const got = await cache.getJSON<{ ok: boolean }>(key);
    expect(got).toEqual({ ok: true });
    const deleted = await cache.invalidateByTags(['city:1:search']);
    expect(deleted).toBeGreaterThan(0);
    const miss = await cache.getJSON(key);
    expect(miss).toBeNull();
  });

  it('SWR: fresh vs stale via fresh marker', async () => {
    const app = mockAppWithRedis();
    const cache = new CacheService(app);
    const key = cache.buildKey('swr', { q: 1 });
    await cache.setJSONWithSWR(key, { v: 1 }, 60, 300, ['city:2:search']);
    const gotFresh = await cache.getJSONWithSWR<any>(key);
    expect(gotFresh).not.toBeNull();
    expect(gotFresh!.stale).toBe(false);
    // simulate staleness by removing fresh marker
    await (app as any).redis.del(`${key}:fresh`);
    const gotStale = await cache.getJSONWithSWR<any>(key);
    expect(gotStale).not.toBeNull();
    expect(gotStale!.stale).toBe(true);
  });

  it('withLock: only one winner executes', async () => {
    const app = mockAppWithRedis();
    const cache = new CacheService(app);
    // pre-set lock to simulate occupied
    const lockKey = 'lock:busy';
    await (app as any).redis.set(lockKey, '1', 'EX', 10);
    const res = await cache.withLock(lockKey, async () => ({ ok: true }));
    expect(res).toBeNull();

    // now free lock, should execute
    await (app as any).redis.del(lockKey);
    const res2 = await cache.withLock(lockKey, async () => ({ ok: true }));
    expect(res2).toEqual({ ok: true });
  });

  it('invalidateByTags removes data and :fresh marker for SWR entries', async () => {
    const app = mockAppWithRedis();
    const cache = new CacheService(app);
    const key = cache.buildKey('swr-inv', { q: 2 });
    // set SWR entry with tags
    await cache.setJSONWithSWR(key, { v: 2 }, 60, 120, ['city:3:search']);
    // ensure it is fresh now
    const before = await cache.getJSONWithSWR<any>(key);
    expect(before).not.toBeNull();
    expect(before!.stale).toBe(false);
    // invalidate by tag
    const deleted = await cache.invalidateByTags(['city:3:search']);
    expect(deleted).toBeGreaterThan(0);
    // both data and fresh marker should be gone
    const after = await cache.getJSONWithSWR<any>(key);
    expect(after).toBeNull();
  });
});

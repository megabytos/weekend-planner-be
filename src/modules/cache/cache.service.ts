import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Redis as RedisClient } from 'ioredis';
import {
  CACHE_ENABLED,
  CACHE_LOCK_TTL,
  CACHE_NAMESPACE_VERSION,
} from '../../config/cache.js';

function sha1(s: string): string {
  return crypto.createHash('sha1').update(s).digest('hex');
}

export type CacheSetOptions = { ttlSeconds: number; tags?: string[] };

export class CacheService {
  private readonly redis: RedisClient | null;
  private readonly enabled: boolean;
  private readonly ns: string;

  constructor(private readonly app: FastifyInstance) {
    this.redis = (app as any).redis ?? null;
    this.enabled = !!this.redis && CACHE_ENABLED;
    this.ns = CACHE_NAMESPACE_VERSION;
  }

  isEnabled(): boolean { return this.enabled; }

  buildKey(prefix: string, parts: unknown): string {
    const json = JSON.stringify(parts ?? {});
    return `${this.ns}:${prefix}:${sha1(json)}`;
  }

  async getJSON<T = any>(key: string): Promise<T | null> {
    if (!this.enabled || !this.redis) return null;
    const raw = await this.redis.get(key);
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  }

  async setJSON(key: string, data: unknown, opts: CacheSetOptions): Promise<void> {
    if (!this.enabled || !this.redis) return;
    const payload = JSON.stringify(data);
    if (opts.ttlSeconds > 0) await this.redis.set(key, payload, 'EX', opts.ttlSeconds);
    else await this.redis.set(key, payload);
    // Tag indexing
    const tags = Array.isArray(opts.tags) ? opts.tags.filter(Boolean) : [];
    if (tags.length) {
      for (const t of tags) {
        const setKey = `${this.ns}:index:${t}`;
        await this.redis.sadd(setKey, key);
        // Optional: set TTL on index slightly longer than data TTL
        if (opts.ttlSeconds > 0) await this.redis.expire(setKey, Math.max(opts.ttlSeconds, 600));
      }
    }
  }

  // SWR: store data with ttl = ttl+swr, and freshness marker key with ttl = ttl
  async setJSONWithSWR(key: string, data: unknown, ttlSeconds: number, swrSeconds: number, tags?: string[]): Promise<void> {
    if (!this.enabled || !this.redis) return;
    const payload = JSON.stringify(data);
    const totalTtl = Math.max(0, ttlSeconds + Math.max(0, swrSeconds));
    if (totalTtl > 0) await this.redis.set(key, payload, 'EX', totalTtl); else await this.redis.set(key, payload);
    const freshKey = `${key}:fresh`;
    if (ttlSeconds > 0) await this.redis.set(freshKey, '1', 'EX', ttlSeconds); else await this.redis.set(freshKey, '1');
    const tagList = Array.isArray(tags) ? tags.filter(Boolean) : [];
    if (tagList.length) {
      for (const t of tagList) {
        const setKey = `${this.ns}:index:${t}`;
        await this.redis.sadd(setKey, key);
        if (totalTtl > 0) await this.redis.expire(setKey, Math.max(totalTtl, 600));
      }
    }
  }

  // Returns cached data and whether it is stale (fresh marker missing)
  async getJSONWithSWR<T = any>(key: string): Promise<{ data: T; stale: boolean } | null> {
    if (!this.enabled || !this.redis) return null;
    const raw = await this.redis.get(key);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw) as T;
      const fresh = await this.redis.exists(`${key}:fresh`);
      return { data, stale: fresh === 0 };
    } catch {
      return null;
    }
  }

  async withLock<T>(lockKey: string, fn: () => Promise<T>): Promise<T | null> {
    if (!this.enabled || !this.redis) return await fn();
    // ioredis typings expect 'EX' <ttl> before the condition flag like 'NX'
    const ok = await this.redis.set(lockKey, '1', 'EX', CACHE_LOCK_TTL, 'NX');
    if (!ok) return null; // someone else holds the lock
    try { return await fn(); } finally { await this.redis!.del(lockKey).catch(() => {}); }
  }

  async invalidateByTags(tags: string[]): Promise<number> {
    if (!this.enabled || !this.redis || !tags.length) return 0;
    let deleted = 0;
    for (const t of tags) {
      const setKey = `${this.ns}:index:${t}`;
      const members = await this.redis.smembers(setKey);
      if (members && members.length) {
        const freshKeys = members.map((k) => `${k}:fresh`);
        deleted += await this.redis.del(...members, ...freshKeys);
      }
      await this.redis.del(setKey);
    }
    return deleted;
  }

  async invalidateByCity(cityId: string, scopes?: string[]): Promise<number> {
    const tags: string[] = [];
    const scopeList = Array.isArray(scopes) && scopes.length ? scopes : ['search', 'catalog:places', 'catalog:events'];
    for (const s of scopeList) tags.push(`city:${cityId}:${s}`);
    return this.invalidateByTags(tags);
  }
}

// Helpers to normalize parts for keys
export function roundGeo(v?: number | null, digits = 5): number | undefined {
  if (v == null) return undefined;
  const m = Math.pow(10, digits);
  return Math.round(v * m) / m;
}

export function normalizeArray<T>(arr?: T[] | null): T[] | undefined {
  if (!Array.isArray(arr)) return undefined;
  return [...arr].sort() as any;
}

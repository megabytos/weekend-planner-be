export const CACHE_ENABLED = process.env.CACHE_ENABLED !== 'false';

function num(name: string, def: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : def;
}

// TTLs (seconds)
export const CACHE_TTL_SEARCH_FIRST = num('CACHE_TTL_SEARCH_FIRST', 60); // first page
export const CACHE_TTL_SEARCH_PAGES = num('CACHE_TTL_SEARCH_PAGES', 300); // other pages
export const CACHE_TTL_CATALOG_PLACES = num('CACHE_TTL_CATALOG_PLACES', 900);
export const CACHE_TTL_CATALOG_EVENTS = num('CACHE_TTL_CATALOG_EVENTS', 600);

// Optional stale-while-revalidate window (seconds) — reserved for future use
export const CACHE_SWR_SEARCH = num('CACHE_SWR_SEARCH', 300);
export const CACHE_SWR_CATALOG_PLACES = num('CACHE_SWR_CATALOG_PLACES', 600);
export const CACHE_SWR_CATALOG_EVENTS = num('CACHE_SWR_CATALOG_EVENTS', 300);

// Lock TTL for stampede protection (seconds)
export const CACHE_LOCK_TTL = num('CACHE_LOCK_TTL', 10);

// Cache version (bump to invalidate all)
export const CACHE_NAMESPACE_VERSION = process.env.CACHE_NS_VERSION || 'v1';

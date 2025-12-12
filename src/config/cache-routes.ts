import {
  CACHE_TTL_SEARCH_FIRST,
  CACHE_TTL_SEARCH_PAGES,
  CACHE_SWR_SEARCH,
  CACHE_TTL_CATALOG_PLACES,
  CACHE_TTL_CATALOG_EVENTS,
  CACHE_SWR_CATALOG_PLACES,
  CACHE_SWR_CATALOG_EVENTS,
} from './cache.js';

// Единая конфигурация кешируемых маршрутов с источниками TTL/SWR из настроек
export const CACHE_ROUTE_RULES = {
  search: {
    ttlFirst: () => CACHE_TTL_SEARCH_FIRST,
    ttlPages: () => CACHE_TTL_SEARCH_PAGES,
    swr: () => CACHE_SWR_SEARCH,
  },
  catalog: {
    placesPopular: {
      ttl: () => CACHE_TTL_CATALOG_PLACES,
      swr: () => CACHE_SWR_CATALOG_PLACES, // по требованию сейчас SWR не используем, но оставляем для расширения
    },
    eventsPopular: {
      ttl: () => CACHE_TTL_CATALOG_EVENTS,
      swr: () => CACHE_SWR_CATALOG_EVENTS,
    },
  },
} as const;

export type CacheRouteRules = typeof CACHE_ROUTE_RULES;

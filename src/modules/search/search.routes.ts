import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { searchRequestSchema, searchResponseSchema, type SearchRequest, type SourceType } from './search.schemas.js';
import { searchUnifiedFromDb } from './search.service.js';
import { runOnlineIngest, type BaseQuery } from '../ingestion/ingestion.service.js';
import { buildEventProviders, buildPlaceProviders } from '../ingestion/provider.adapters.js';
import { IngestLogger } from '../ingestion/ingest.logger.js';
import { GeoService } from '../geo/geo.service.js';
import { CacheService, normalizeArray, roundGeo } from '../cache/cache.service.js';
import { CACHE_ENABLED, CACHE_TTL_SEARCH_FIRST, CACHE_TTL_SEARCH_PAGES, CACHE_SWR_SEARCH, CACHE_INVALIDATE_AFTER_INGEST } from '../../config/cache.js';

// Search routes under /api/search using Zod schemas and service layer
export default async function searchRoutes(app: FastifyInstance) {
  app.post(
    '/',
    {
      schema: {
        description: 'Unified search for places and events. Supports multiple data sources and filtering options.',
        tags: ['search'],
        body: searchRequestSchema,
        response: { 200: searchResponseSchema },
      },
    },
    async (req) => {
      const query = req.body as z.infer<typeof searchRequestSchema> as SearchRequest;
      // Use validated config exposed on app instance
      const { TICKETMASTER_API_KEY, PREDICTHQ_TOKEN, GEOAPIFY_API_KEY, GOOGLE_PLACES_API_KEY, FOURSQUARE_API_KEY } = app.config;

      // Try cache first
      const cache = new CacheService(app);
      // Derive effective pagination: frontend uses page (1-based), may omit offset entirely
      const effLimit = query.pagination?.limit ?? 100;
      const effPage = query.pagination?.page ?? 1;
      const effOffset = Math.max(0, (effPage - 1) * effLimit);
      const isFirstPage = effPage <= 1;

      // Build normalized cache key
      const keyParts = {
        target: query.target,
        sort: query.sort,
        limit: effLimit,
        page: effPage,
        offset: effOffset,
        // where
        cityId: query.where?.city?.id ?? undefined,
        bbox: query.where?.bbox
          ? {
              south: roundGeo(query.where.bbox.south),
              west: roundGeo(query.where.bbox.west),
              north: roundGeo(query.where.bbox.north),
              east: roundGeo(query.where.bbox.east),
            }
          : undefined,
        geo: query.where?.geo
          ? { lat: roundGeo(query.where.geo.lat), lon: roundGeo(query.where.geo.lon), radiusKm: Math.round((query.where.geo.radiusKm ?? 5) * 2) / 2 }
          : undefined,
        // when (do not over-normalize presets)
        when: query.when?.type === 'preset' ? query.when : query.when?.type === 'range' ? { type: 'range', from: query.when.from.slice(0, 13), to: query.when.to.slice(0, 13) } : undefined,
        // filters
        filters: {
          categories: normalizeArray(query.filters?.categorySlugs),
          sources: normalizeArray(query.filters?.sources),
          priceTier: query.budget?.tier && query.budget.tier !== 'ANY' ? query.budget.tier : undefined,
        },
      };
      const cacheKey = cache.buildKey('search', keyParts);

      if (cache.isEnabled()) {
        const cached = await cache.getJSONWithSWR<any>(cacheKey);
        if (cached) {
          if (!cached.stale) return cached.data;
          // SWR: refresh in background under lock, return stale immediately
          const refreshTtl = isFirstPage ? CACHE_TTL_SEARCH_FIRST : CACHE_TTL_SEARCH_PAGES;
          const tags: string[] = [];
          if (query.where?.city?.id != null) tags.push(`city:${query.where.city.id}:search`);
          const lockKey = `${cacheKey}:lock`;
          // Background task
          void cache.withLock(lockKey, async () => {
            // Re-run generation (including ingest if first page)
            try {
              const recompute = await (async () => {
                // Duplicate the main flow in a contained scope
                let warnings: string[] | undefined;
                try {
                  if (isFirstPage) {
                    const ingestLogger = new IngestLogger();
                    const requestedSources = new Set<SourceType>(
                      (query.filters?.sources && query.filters.sources.length
                        ? query.filters.sources
                        : (['TICKETMASTER', 'PREDICTHQ', 'GEOAPIFY', 'GOOGLE_PLACES', 'FOURSQUARE'] as SourceType[]))
                    );
                    const baseQuery: BaseQuery = {
                      q: query.q,
                      lat: query.where?.geo?.lat,
                      lon: query.where?.geo?.lon,
                      radiusKm: query.where?.geo?.radiusKm ?? 10,
                      cityId: query.where?.city?.id != null ? String(query.where.city.id) : undefined,
                      fromISO: query.when?.type === 'range' ? query.when.from : undefined,
                      toISO: query.when?.type === 'range' ? query.when.to : undefined,
                      size: undefined,
                    };
                    try {
                      if (!baseQuery.lat && !baseQuery.lon && query.where?.city?.id != null) {
                        const geoSvc = new GeoService();
                        const cityObj = geoSvc.getCityById(query.where.city.id as any);
                        if (cityObj) {
                          const centerLat = cityObj.coordinates?.lat;
                          const centerLon = cityObj.coordinates?.lon;
                          if (centerLat != null && centerLon != null) {
                            baseQuery.lat = centerLat; baseQuery.lon = centerLon;
                          }
                          if (cityObj.boundingBox && centerLat != null && centerLon != null) {
                            const south = cityObj.boundingBox.minLat; const west = cityObj.boundingBox.minLon;
                            const north = cityObj.boundingBox.maxLat; const east = cityObj.boundingBox.maxLon;
                            const toRad = (x: number) => (x * Math.PI) / 180; const R = 6371;
                            const dLat = toRad(north - centerLat); const dLon = toRad(east - centerLon);
                            const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(centerLat)) * Math.cos(toRad(north)) * Math.sin(dLon / 2) ** 2;
                            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                            const halfDiagonalKm = R * c; baseQuery.radiusKm = Math.max(2, Math.min(50, Math.round(halfDiagonalKm)));
                          }
                          baseQuery.cityName = cityObj.name; baseQuery.countryCode = cityObj.countryCode;
                        }
                      }
                    } catch {}
                    // requestedSources already defined above
                    const rect = query.where?.bbox
                      ? { minLon: query.where.bbox.west, minLat: query.where.bbox.south, maxLon: query.where.bbox.east, maxLat: query.where.bbox.north }
                      : undefined;
                    const textSearchCityQuery = query.where?.city?.name;
                    const eventProviders = buildEventProviders({
                      ticketmasterApiKey: app.config.TICKETMASTER_API_KEY,
                      predicthqToken: app.config.PREDICTHQ_TOKEN,
                      geoapifyApiKey: app.config.GEOAPIFY_API_KEY,
                      googlePlacesApiKey: app.config.GOOGLE_PLACES_API_KEY,
                      foursquareApiKey: app.config.FOURSQUARE_API_KEY,
                    }, requestedSources);
                    const placeProviders = buildPlaceProviders({
                      ticketmasterApiKey: app.config.TICKETMASTER_API_KEY,
                      predicthqToken: app.config.PREDICTHQ_TOKEN,
                      geoapifyApiKey: app.config.GEOAPIFY_API_KEY,
                      googlePlacesApiKey: app.config.GOOGLE_PLACES_API_KEY,
                      foursquareApiKey: app.config.FOURSQUARE_API_KEY,
                    }, requestedSources, { textSearchCityQuery, rect });
                    const swrIngestLogger = new IngestLogger();
                    const res = await runOnlineIngest({ prisma: app.prisma, eventProviders, placeProviders, logger: swrIngestLogger }, baseQuery);
                    swrIngestLogger.flushToFile(true);
                    warnings = [
                      `ingest places: total=${res.placeStats.total} created=${res.placeStats.created} updated=${res.placeStats.updated} unchanged=${res.placeStats.unchanged} errors=${res.placeStats.errors}`,
                      `ingest events: total=${res.eventStats.total} created=${res.eventStats.created} updated=${res.eventStats.updated} unchanged=${res.eventStats.unchanged} errors=${res.eventStats.errors}`,
                    ];
                  }
                } catch {}
                const freshResp = await searchUnifiedFromDb(query, app.prisma);
                if (warnings && warnings.length) (freshResp as any).warnings = [ ...(freshResp.warnings ?? []), ...warnings ].slice(0, 10);
                return freshResp;
              })();
              const ttl = isFirstPage ? CACHE_TTL_SEARCH_FIRST : CACHE_TTL_SEARCH_PAGES;
              await cache.setJSONWithSWR(cacheKey, recompute, ttl, CACHE_SWR_SEARCH, tags);
            } catch {}
          });
          // Return stale cached immediately
          return cached.data;
        }
      }

      // Trigger online ingest only on the first page
      try {
        if (isFirstPage) {
          const ingestLogger = new IngestLogger();
          // Determine requested sources
          const requestedSources = new Set<SourceType>(
            (query.filters?.sources && query.filters.sources.length
              ? query.filters.sources
              : (['TICKETMASTER', 'PREDICTHQ', 'GEOAPIFY', 'GOOGLE_PLACES', 'FOURSQUARE'] as SourceType[]))
          );

          // Build a minimal BaseQuery for providers
          // Build BaseQuery enriched from city when provided
          const baseQuery: BaseQuery = {
            q: query.q,
            lat: query.where?.geo?.lat,
            lon: query.where?.geo?.lon,
            radiusKm: query.where?.geo?.radiusKm ?? 10,
            cityId: query.where?.city?.id != null ? String(query.where.city.id) : undefined,
            // For MVP we skip complex time presets here; providers can still work without
            fromISO: query.when?.type === 'range' ? query.when.from : undefined,
            toISO: query.when?.type === 'range' ? query.when.to : undefined,
            size: undefined,
          };

          // If city.id provided but no explicit geo, enrich lat/lon/radius and city meta
          try {
            if (!baseQuery.lat && !baseQuery.lon && query.where?.city?.id != null) {
              const geo = new GeoService();
              const cityObj = geo.getCityById(query.where.city.id as any);
              if (cityObj) {
                const centerLat = cityObj.coordinates?.lat;
                const centerLon = cityObj.coordinates?.lon;
                if (centerLat != null && centerLon != null) {
                  baseQuery.lat = centerLat;
                  baseQuery.lon = centerLon;
                }
                // approximate radius from bbox half-diagonal if available
                if (cityObj.boundingBox) {
                  const south = cityObj.boundingBox.minLat;
                  const west = cityObj.boundingBox.minLon;
                  const north = cityObj.boundingBox.maxLat;
                  const east = cityObj.boundingBox.maxLon;
                  if (
                    typeof south === 'number' && typeof west === 'number' &&
                    typeof north === 'number' && typeof east === 'number' &&
                    typeof centerLat === 'number' && typeof centerLon === 'number'
                  ) {
                    const toRad = (x: number) => (x * Math.PI) / 180;
                    const R = 6371;
                    const dLat = toRad(north - centerLat);
                    const dLon = toRad(east - centerLon);
                    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(centerLat)) * Math.cos(toRad(north)) * Math.sin(dLon / 2) ** 2;
                    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                    const halfDiagonalKm = R * c;
                    baseQuery.radiusKm = Math.max(2, Math.min(50, Math.round(halfDiagonalKm)));
                  }
                }
                baseQuery.cityName = cityObj.name;
                baseQuery.countryCode = cityObj.countryCode;
              }
            }
          } catch {
            // ignore enrichment errors
          }

          // Optional helpers for city text search and bbox — prefer DB City bbox/name when city.id is provided
          let rect = query.where?.bbox
            ? { minLon: query.where.bbox.west, minLat: query.where.bbox.south, maxLon: query.where.bbox.east, maxLat: query.where.bbox.north }
            : undefined;
          let textSearchCityQuery = query.where?.city?.name;
          if (!rect && query.where?.city?.id != null) {
            try {
              const cityRow = await app.prisma.city.findUnique({
                where: { id: String(query.where.city.id) },
                select: { name: true, countryCode: true, minLat: true, minLng: true, maxLat: true, maxLng: true },
              });
              if (cityRow) {
                textSearchCityQuery ||= cityRow.name;
                if (
                  cityRow.minLat != null && cityRow.minLng != null &&
                  cityRow.maxLat != null && cityRow.maxLng != null
                ) {
                  rect = { minLon: Number(cityRow.minLng as any), minLat: Number(cityRow.minLat as any), maxLon: Number(cityRow.maxLng as any), maxLat: Number(cityRow.maxLat as any) };
                }
              }
            } catch {
              // ignore DB errors here
            }
          }

          const eventProviders = buildEventProviders(
            {
              ticketmasterApiKey: TICKETMASTER_API_KEY,
              predicthqToken: PREDICTHQ_TOKEN,
              geoapifyApiKey: GEOAPIFY_API_KEY,
              googlePlacesApiKey: GOOGLE_PLACES_API_KEY,
              foursquareApiKey: FOURSQUARE_API_KEY,
            },
            requestedSources
          );
          const placeProviders = buildPlaceProviders(
            {
              ticketmasterApiKey: TICKETMASTER_API_KEY,
              predicthqToken: PREDICTHQ_TOKEN,
              geoapifyApiKey: GEOAPIFY_API_KEY,
              googlePlacesApiKey: GOOGLE_PLACES_API_KEY,
              foursquareApiKey: FOURSQUARE_API_KEY,
            },
            requestedSources,
            { textSearchCityQuery, rect }
          );

          const ingestResult = await runOnlineIngest(
            {
              prisma: app.prisma,
              eventProviders,
              placeProviders,
              logger: ingestLogger,
            },
            baseQuery
          );
          // Flush full debug log to file if enabled
          ingestLogger.flushToFile(true);
          // Attach short warnings to request object for later merging into response
          (req as any)._ingestWarnings = [
            `ingest places: total=${ingestResult.placeStats.total} created=${ingestResult.placeStats.created} updated=${ingestResult.placeStats.updated} unchanged=${ingestResult.placeStats.unchanged} errors=${ingestResult.placeStats.errors}`,
            `ingest events: total=${ingestResult.eventStats.total} created=${ingestResult.eventStats.created} updated=${ingestResult.eventStats.updated} unchanged=${ingestResult.eventStats.unchanged} errors=${ingestResult.eventStats.errors}`,
            ...ingestResult.warnings.slice(0, 5),
            ...ingestLogger.summary(5),
          ].slice(0, 10);

          // Invalidate city cache after ingest (search + catalog) if cityId is known
          // Optional: invalidate per-city caches (disabled by default to keep first heavy response for full TTL)
          if (CACHE_INVALIDATE_AFTER_INGEST) {
            const cityIdForInvalidation = baseQuery.cityId ?? (query.where?.city?.id != null ? String(query.where.city.id) : undefined);
            if (cityIdForInvalidation && cache.isEnabled()) {
              try { await cache.invalidateByCity(String(cityIdForInvalidation), ['search', 'catalog:places', 'catalog:events']); } catch {}
            }
          }
        }
      } catch (e) {
        // Swallow ingest errors for MVP to not break search endpoint
        req.log.warn({ err: e }, 'online ingest failed');
      }
      // After (possible) ingest, return results from our DB with ranking
      const resp = await searchUnifiedFromDb(query, app.prisma);
      // Merge short warnings from ingest into response (limit total number)
      const shortIngestWarnings: string[] | undefined = (req as any)._ingestWarnings;
      if (shortIngestWarnings && shortIngestWarnings.length) {
        const merged = [...(resp.warnings ?? []), ...shortIngestWarnings].slice(0, 10);
        (resp as any).warnings = merged;
      }

      // Save to cache
      if (cache.isEnabled()) {
        const ttl = isFirstPage ? CACHE_TTL_SEARCH_FIRST : CACHE_TTL_SEARCH_PAGES;
        const tags: string[] = [];
        if (query.where?.city?.id != null) tags.push(`city:${query.where.city.id}:search`);
        try { await cache.setJSONWithSWR(cacheKey, resp, ttl, CACHE_SWR_SEARCH, tags); } catch {}
      }
      return resp;
    }
  );
}

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { searchRequestSchema, searchResponseSchema, type SearchRequest, type SourceType } from './search.schemas.js';
import { searchUnifiedFromDb } from './search.service.js';
import { runOnlineIngest, type BaseQuery } from '../ingestion/ingestion.service.js';
import { buildEventProviders, buildPlaceProviders } from '../ingestion/provider.adapters.js';
import { IngestLogger } from '../ingestion/ingest.logger.js';
import { GeoService } from '../geo/geo.service.js';

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

      // Trigger online ingest only on the first page (offset === 0)
      try {
        if ((query.pagination?.offset ?? 0) === 0) {
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
      return resp;
    }
  );
}

import type { PrismaClient } from "@prisma/client";
import { GLOBAL_INGEST_LIMIT, PROVIDER_LIMITS } from "../../config/providers.js";
import type { NormalizedEventLike, NormalizedPlaceLike } from "./dedup.service.js";
import { IngestionDedupService } from "./dedup.service.js";
import { IngestionMergeService } from "./merge.service.js";
import { IngestionPersistService, type IngestStats } from "./persist.service.js";
import type { SourceType } from "../search/search.schemas.js";
import { IngestLogger } from "./ingest.logger.js";

export type SearchTimeWindow = { fromISO?: string; toISO?: string };
export type GeoPoint = { lat?: number; lon?: number; radiusKm?: number };

export type BaseQuery = GeoPoint & SearchTimeWindow & {
  q?: string;
  size?: number;
  // Optional resolved city id from request (DB City.id, string)
  cityId?: string;
  // Optional resolved city meta for providers that support textual filters (e.g., Ticketmaster)
  cityName?: string;
  countryCode?: string;
};

export interface EventProvider {
  name: string;
  source: SourceType; // to apply per-provider limits
  searchEvents(query: BaseQuery): Promise<{ items: NormalizedEventLike[]; total?: number; warning?: string }>;
}

export interface PlaceProvider {
  name: string;
  source: SourceType;
  searchPlaces(query: BaseQuery): Promise<{ items: NormalizedPlaceLike[]; total?: number; warning?: string }>;
}

export type OnlineIngestDeps = {
  prisma: PrismaClient;
  eventProviders: EventProvider[];
  placeProviders: PlaceProvider[];
  logger?: IngestLogger;
};

export type OnlineIngestResult = {
  placeStats: IngestStats;
  eventStats: IngestStats;
  warnings: string[];
};

function cap<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  return arr.slice(0, n);
}

// Run online ingest for both places and events with provider limits and global cap.
export async function runOnlineIngest(
  deps: OnlineIngestDeps,
  query: BaseQuery
): Promise<OnlineIngestResult> {
  const { prisma, eventProviders, placeProviders, logger } = deps;

  const warnings: string[] = [];
  logger?.log(`online-ingest: start; query q=${query.q ?? ''} lat=${query.lat ?? ''} lon=${query.lon ?? ''} radiusKm=${query.radiusKm ?? ''} from=${query.fromISO ?? ''} to=${query.toISO ?? ''}`);

  // Fetch from providers in parallel (isolate failures)
  const placePromises = placeProviders.map(async (p) => {
    const limit = PROVIDER_LIMITS[p.source] ?? 0;
    if (limit <= 0) return { items: [] as NormalizedPlaceLike[], warning: undefined as string | undefined };
    try {
      logger?.log(`place provider ${p.name} (${p.source}) start; limit=${limit}`);
      const { items, warning } = await p.searchPlaces({ ...query, size: limit });
      logger?.log(`place provider ${p.name} returned items=${items.length}${warning ? `; warning=${warning}` : ''}`);
      if (warning) warnings.push(`${p.name}: ${warning}`);
      return { items: cap(items, limit) };
    } catch (e: any) {
      const msg = `${p.name}: ${e?.message || 'error'}`;
      warnings.push(msg);
      logger?.log(`place provider ${p.name} error: ${msg}`);
      return { items: [] as NormalizedPlaceLike[] };
    }
  });

  const eventPromises = eventProviders.map(async (p) => {
    const limit = PROVIDER_LIMITS[p.source] ?? 0;
    if (limit <= 0) return { items: [] as NormalizedEventLike[], warning: undefined as string | undefined };
    try {
      logger?.log(`event provider ${p.name} (${p.source}) start; limit=${limit}`);
      const { items, warning } = await p.searchEvents({ ...query, size: limit });
      logger?.log(`event provider ${p.name} returned items=${items.length}${warning ? `; warning=${warning}` : ''}`);
      if (warning) warnings.push(`${p.name}: ${warning}`);
      return { items: cap(items, limit) };
    } catch (e: any) {
      const msg = `${p.name}: ${e?.message || 'error'}`;
      warnings.push(msg);
      logger?.log(`event provider ${p.name} error: ${msg}`);
      return { items: [] as NormalizedEventLike[] };
    }
  });

  const placeResults = await Promise.all(placePromises);
  const eventResults = await Promise.all(eventPromises);

  // Merge and cap globally
  const allPlaces = cap(placeResults.flatMap((r) => r.items), GLOBAL_INGEST_LIMIT);
  const allEvents = cap(eventResults.flatMap((r) => r.items), GLOBAL_INGEST_LIMIT);
  logger?.log(`providers merged: places beforeCap=${placeResults.reduce((n,r)=>n+(r.items?.length||0),0)} afterCap=${allPlaces.length}; events beforeCap=${eventResults.reduce((n,r)=>n+(r.items?.length||0),0)} afterCap=${allEvents.length}`);

  // Enrich missing cityId for normalized items before Persist
  async function resolveCityIdByPoint(lat: number, lon: number): Promise<string | null> {
    // Load cities once; try match by padded bbox (10% inflate), then fallback by nearest center
    const candidates = await prisma.city.findMany({
      select: { id: true, lat: true, lng: true, minLat: true, minLng: true, maxLat: true, maxLng: true },
    });

    // First pass: check if point falls into any city bbox (inflated by 10%)
    for (const c of candidates) {
      const minLat = c.minLat != null ? Number(c.minLat as any) : null;
      const minLng = c.minLng != null ? Number(c.minLng as any) : null;
      const maxLat = c.maxLat != null ? Number(c.maxLat as any) : null;
      const maxLng = c.maxLng != null ? Number(c.maxLng as any) : null;
      if (
        minLat == null || minLng == null || maxLat == null || maxLng == null ||
        Number.isNaN(minLat) || Number.isNaN(minLng) || Number.isNaN(maxLat) || Number.isNaN(maxLng)
      ) continue;
      const spanLat = Math.max(0, maxLat - minLat);
      const spanLng = Math.max(0, maxLng - minLng);
      // Inflate bbox by 10% total (≈5% on each side)
      const padLat = spanLat * 0.05;
      const padLng = spanLng * 0.05;
      const minLatP = minLat - padLat;
      const maxLatP = maxLat + padLat;
      const minLngP = minLng - padLng;
      const maxLngP = maxLng + padLng;
      if (lat >= minLatP && lat <= maxLatP && lon >= minLngP && lon <= maxLngP) {
        return c.id;
      }
    }

    // Fallback: nearest by center point (simple haversine)
    let best: { id: string; d: number } | null = null;
    const toRad = (x: number) => (x * Math.PI) / 180;
    for (const c of candidates) {
      const clat = Number(c.lat as any);
      const clon = Number(c.lng as any);
      if (isNaN(clat) || isNaN(clon)) continue;
      const R = 6371e3;
      const dLat = toRad(clat - lat);
      const dLon = toRad(clon - lon);
      const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(clat)) * Math.sin(dLon / 2) ** 2;
      const d = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)) * R;
      if (!best || d < best.d) best = { id: c.id, d };
    }
    return best?.id ?? null;
  }

  let enrichedPlaces = 0;
  let unresolvedPlaces = 0;
  for (const it of allPlaces) {
    if (!it.cityId) {
      if (it.location?.lat != null && it.location?.lon != null) {
        // Prefer resolving city by actual coordinates first
        const cid = await resolveCityIdByPoint(it.location.lat, it.location.lon);
        if (cid) {
          it.cityId = cid;
          enrichedPlaces++;
          continue;
        }
      }
      // Fallback: if request had explicit cityId but we couldn't resolve by point (or there are no coords)
      if (query.cityId) {
        it.cityId = query.cityId;
        enrichedPlaces++;
      } else {
        unresolvedPlaces++;
      }
    }
  }
  let enrichedEvents = 0;
  let unresolvedEvents = 0;
  for (const it of allEvents) {
    if (!it.cityId) {
      if (it.location?.lat != null && it.location?.lon != null) {
        // Prefer resolving by coordinates
        const cid = await resolveCityIdByPoint(it.location.lat, it.location.lon);
        if (cid) {
          it.cityId = cid;
          enrichedEvents++;
          continue;
        }
      }
      if (query.cityId) {
        it.cityId = query.cityId;
        enrichedEvents++;
      } else {
        unresolvedEvents++;
      }
    }
  }
  logger?.log(`city enrichment: places enriched=${enrichedPlaces} unresolved=${unresolvedPlaces}; events enriched=${enrichedEvents} unresolved=${unresolvedEvents}`);

  // Persist
  const dedup = new IngestionDedupService(prisma);
  const merge = new IngestionMergeService();
  const persist = new IngestionPersistService(prisma, dedup, merge, undefined, logger);

  // Items may come from mixed sources; for stats we pass source per-item to persist methods already.
  // Our Persist API currently expects a single provider SourceType parameter; to keep API stable for now,
  // we split by provider source and run per-chunk, then aggregate stats.

  const aggregatePlaceStats: IngestStats = { total: 0, created: 0, updated: 0, unchanged: 0, errors: 0, warnings: [] };
  const aggregateEventStats: IngestStats = { total: 0, created: 0, updated: 0, unchanged: 0, errors: 0, warnings: [] };

  // Group by source
  const placeBySource = new Map<SourceType, NormalizedPlaceLike[]>();
  for (const it of allPlaces) {
    const s = it.source.source as SourceType;
    const arr = placeBySource.get(s) ?? [];
    arr.push(it);
    placeBySource.set(s, arr);
  }

  for (const [src, arr] of placeBySource) {
    logger?.log(`persist places for source=${src}: count=${arr.length}`);
    const st = await persist.ingestPlaces(src, arr);
    logger?.log(`persist places done for source=${src}: total=${st.total} created=${st.created} updated=${st.updated} unchanged=${st.unchanged} errors=${st.errors}`);
    aggregatePlaceStats.total += st.total;
    aggregatePlaceStats.created += st.created;
    aggregatePlaceStats.updated += st.updated;
    aggregatePlaceStats.unchanged += st.unchanged;
    aggregatePlaceStats.errors += st.errors;
    aggregatePlaceStats.warnings.push(...st.warnings);
  }

  const eventBySource = new Map<SourceType, NormalizedEventLike[]>();
  for (const it of allEvents) {
    const s = it.source.source as SourceType;
    const arr = eventBySource.get(s) ?? [];
    arr.push(it);
    eventBySource.set(s, arr);
  }

  for (const [src, arr] of eventBySource) {
    logger?.log(`persist events for source=${src}: count=${arr.length}`);
    const st = await persist.ingestEvents(src, arr);
    logger?.log(`persist events done for source=${src}: total=${st.total} created=${st.created} updated=${st.updated} unchanged=${st.unchanged} errors=${st.errors}`);
    aggregateEventStats.total += st.total;
    aggregateEventStats.created += st.created;
    aggregateEventStats.updated += st.updated;
    aggregateEventStats.unchanged += st.unchanged;
    aggregateEventStats.errors += st.errors;
    aggregateEventStats.warnings.push(...st.warnings);
  }
  logger?.log(`online-ingest: summary places={total:${aggregatePlaceStats.total}, created:${aggregatePlaceStats.created}, updated:${aggregatePlaceStats.updated}, unchanged:${aggregatePlaceStats.unchanged}, errors:${aggregatePlaceStats.errors}} events={total:${aggregateEventStats.total}, created:${aggregateEventStats.created}, updated:${aggregateEventStats.updated}, unchanged:${aggregateEventStats.unchanged}, errors:${aggregateEventStats.errors}}`);
  return { placeStats: aggregatePlaceStats, eventStats: aggregateEventStats, warnings };
}

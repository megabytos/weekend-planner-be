import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import type { SearchRequest } from './search.schemas.js';
import {
  searchResponseSchema,
  type SearchResponse,
  SourceTypeEnum,
  searchHitSchema,
} from './search.schemas.js';
import { searchTicketmaster } from '../ingestion/providers/events/ticketmaster.provider.js';
import { searchPredictHQ } from '../ingestion/providers/events/predicthq.provider.js';
import { TAXONOMY_CATEGORIES } from '../catalog/taxonomy/taxonomy.constants.js';
import { resolveExpectedDurationForEvent, resolveExpectedDurationForPlace} from '../catalog/taxonomy/duration.js';
import { searchGeoapify } from '../ingestion/providers/places/geoapify.provider.js';
import { searchGooglePlaces } from '../ingestion/providers/places/google-places.provider.js';
import { searchFoursquarePlaces } from '../ingestion/providers/places/foursquare.provider.js';
import { EVENT_TO_TICKETMASTER } from '../catalog/taxonomy/mapping.ticketmaster.js';
import { EVENT_TO_PREDICTHQ } from '../catalog/taxonomy/mapping.predicthq.js';
import type { SourceType } from './search.schemas.js';
import { GeoService } from '../geo/geo.service.js';

// Config: return only items that have photos (imageUrl)
const SEARCH_ONLY_WITH_PHOTOS = process.env.SEARCH_ONLY_WITH_PHOTOS === 'true';

export type ProviderKeys = {
  ticketmasterApiKey?: string;
  predicthqToken?: string;
  geoapifyApiKey?: string;
  googlePlacesApiKey?: string;
  foursquareApiKey?: string;
};

function resolveTimeWindow(query: SearchRequest): { fromISO?: string; toISO?: string } {
  const now = new Date();
  let fromISO: string | undefined;
  let toISO: string | undefined;
  if (!query.when) {
    // default to next 14 days from now
    const start = new Date(now);
    const end = new Date(now);
    end.setDate(end.getDate() + 10);
    fromISO = start.toISOString();
    toISO = end.toISOString();
    return { fromISO, toISO };
  }
  if (query.when.type === 'range') {
    fromISO = query.when.from;
    toISO = query.when.to;
    return { fromISO, toISO };
  }

  // Presets
  const start = new Date(now);
  const end = new Date(now);
  switch (query.when.preset) {
    case 'now':
      end.setHours(end.getHours() + 6);
      break;
    case 'today_evening':
    case 'tonight': {
      const d = new Date(now);
      d.setHours(18, 0, 0, 0);
      start.setTime(d.getTime());
      const endTonight = new Date(d);
      endTonight.setHours(23, 59, 59, 999);
      end.setTime(endTonight.getTime());
      break;
    }
    case 'tomorrow': {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(0, 0, 0, 0);
      start.setTime(d.getTime());
      const e = new Date(d);
      e.setHours(23, 59, 59, 999);
      end.setTime(e.getTime());
      break;
    }
    case 'this_weekend': {
      // upcoming Friday 18:00 to Sunday 23:59
      const d = new Date(now);
      const day = d.getDay(); // 0 Sun .. 6 Sat
      const daysUntilFriday = (5 - day + 7) % 7; // 5 = Friday
      const friday = new Date(d);
      friday.setDate(d.getDate() + daysUntilFriday);
      friday.setHours(18, 0, 0, 0);
      const sunday = new Date(friday);
      sunday.setDate(friday.getDate() + 2);
      sunday.setHours(23, 59, 59, 999);
      start.setTime(friday.getTime());
      end.setTime(sunday.getTime());
      break;
    }
  }
  fromISO = start.toISOString();
  toISO = end.toISOString();
  return { fromISO, toISO };
}

// Utilities
function safeISO(dateStr?: string | null): string | undefined {
  if (!dateStr) return undefined;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

function computeWeekday(iso?: string): number | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return undefined;
  return d.getDay(); // 0..6
}

function haversineKm(a?: { lat: number; lon: number } | null, b?: { lat: number; lon: number } | null): number | undefined {
  if (!a || !b) return undefined;
  const R = 6371; // km
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}



function derivePriceTier(price?: { from?: number | null; to?: number | null }): 'FREE' | 'CHEAP' | 'MODERATE' | 'EXPENSIVE' | null | undefined {
  if (!price) return undefined;
  const from = price.from ?? undefined;
  if (from === 0) return 'FREE';
  if (from == null) return undefined;
  if (from <= 10) return 'CHEAP';
  if (from <= 30) return 'MODERATE';
  return 'EXPENSIVE';
}

function mapCategoryToTaxonomy(slugsOrNames: string[]): { slug: string; type: 'EVENT' | 'PLACE' | 'TAG'; name?: string } | null {
  const lower = slugsOrNames.map((s) => String(s).toLowerCase());
  const match = TAXONOMY_CATEGORIES.find(
    (c) => lower.some((x) => c.slug === x || c.name.toLowerCase().includes(x) || x.includes(c.name.toLowerCase()))
  );
  return match ? { slug: match.slug, type: match.type, name: match.name } : null;
}

// Helpers moved to shared taxonomy/duration to keep parity with ingest
// (keep addMinutesISO inline if needed elsewhere)
function addMinutesISO(iso: string, minutes: number): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

export async function searchUnified(
  query: SearchRequest,
  keys: ProviderKeys
): Promise<SearchResponse> {
  const started = Date.now();
  const warnings: string[] = [];

  // Resolve time window
  const { fromISO, toISO } = resolveTimeWindow(query);

  // Determine which sources to query
  const requestedSources = new Set(
    (query.filters?.sources && query.filters.sources.length
      ? query.filters.sources
      : (['TICKETMASTER', 'PREDICTHQ', 'GEOAPIFY', 'GOOGLE_PLACES', 'FOURSQUARE'] as SourceType[]))
  );

  const shouldQueryEvents = query.target === 'events' || query.target === 'both';
  const shouldQueryPlaces = query.target === 'places' || query.target === 'both';

  // Resolve city by ID (from geo module) and enrich location params
  const geoService = new GeoService();
  // Determine location mode: GEO (strict), BBOX (strict), CITY
  const hasGeo = !!query.where.geo && query.where.geo.lat != null && query.where.geo.lon != null;
  const hasBbox = !!query.where.bbox;
  const hasCityId = !!query.where.city?.id;
  const mode: 'GEO' | 'BBOX' | 'CITY' = hasGeo ? 'GEO' : hasBbox ? 'BBOX' : 'CITY';
  let resolvedCityName: string | undefined = query.where.city?.name;
  let resolvedCountryCode: string | undefined = query.where.city?.countryCode;
  let resolvedIATA: string | undefined = undefined;
  let resolvedLat: number | undefined = query.where.geo?.lat;
  let resolvedLon: number | undefined = query.where.geo?.lon;
  let resolvedRadiusKm: number | undefined = query.where.geo?.radiusKm;

  if (query.where.city?.id != null) {
    const cityObj = geoService.getCityById(query.where.city.id);
    if (!cityObj) {
      warnings.push(`City with id=${query.where.city.id} was not found in geo dataset.`);
    } else {
      resolvedCityName = cityObj.name || resolvedCityName;
      resolvedCountryCode = cityObj.countryCode || resolvedCountryCode;
      resolvedIATA = cityObj.codeIATA || undefined;
      if (resolvedLat == null || resolvedLon == null) {
        resolvedLat = cityObj.coordinates?.lat;
        resolvedLon = cityObj.coordinates?.lon;
      }
      if (resolvedRadiusKm == null && cityObj.boundingBox) {
        // Rough radius from bbox: half of diagonal distance
        const centerLat = cityObj.coordinates?.lat;
        const centerLon = cityObj.coordinates?.lon;
        const cornerLat = cityObj.boundingBox.maxLat;
        const cornerLon = cityObj.boundingBox.maxLon;
        if (
          centerLat != null && centerLon != null &&
          cornerLat != null && cornerLon != null
        ) {
          const toRad = (x: number) => (x * Math.PI) / 180;
          const R = 6371;
          const dLat = toRad(cornerLat - centerLat);
          const dLon = toRad(cornerLon - centerLon);
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(centerLat)) * Math.cos(toRad(cornerLat)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const halfDiagonalKm = (R * c);
          resolvedRadiusKm = Math.max(2, Math.min(50, Math.round(halfDiagonalKm)));
        }
      }
    }
  }

  type Hit = z.infer<typeof searchHitSchema>;
  let hits: Hit[] = [];

  let totalEventsCount = 0;
  let totalPlacesCount = 0;

  let sizeDivider = 5;
  if(query.target === "both"){ sizeDivider = !hasGeo && !hasCityId ? 2 : 5;}
  else if(query.target === "events"){ sizeDivider = !hasGeo && !hasCityId ? 1 : 2;}
  else if(query.target === "places"){ sizeDivider = !hasGeo && !hasCityId ? 1 : 3;}

  if (shouldQueryEvents) {
    // Compute effective location parameters per mode
    let city: string | undefined = undefined;
    let countryCode: string | undefined = undefined;
    let lat: number | undefined = undefined;
    let lon: number | undefined = undefined;
    let radiusKm: number | undefined = undefined;

    if (mode === 'GEO') {
      lat = query.where.geo!.lat;
      lon = query.where.geo!.lon;
      radiusKm = query.where.geo!.radiusKm ?? 10;
      // Strictly coordinates: do not pass city/country to providers in this mode
    } else if (mode === 'BBOX') {
      const bbox = query.where.bbox!;
      // center of bbox
      const centerLat = (bbox.south + bbox.north) / 2;
      const centerLon = (bbox.west + bbox.east) / 2;
      // approximate radius as half of diagonal distance
      const diagKm = haversineKm({ lat: bbox.south, lon: bbox.west }, { lat: bbox.north, lon: bbox.east }) || 10;
      const halfDiagKm = Math.max(1, Math.min(100, Math.round(diagKm / 2)));
      lat = centerLat;
      lon = centerLon;
      radiusKm = halfDiagKm;
    } else {
      // CITY mode
      city = resolvedCityName || query.where.city?.code;
      countryCode = resolvedCountryCode?.toUpperCase();
      lat = resolvedLat;
      lon = resolvedLon;
      radiusKm = resolvedRadiusKm ?? 10;
      if (!city || !countryCode) {
        // We'll fallback to coords if city/country missing
      }
    }
    if (mode !== 'GEO' && (lat === undefined || lon === undefined) && (!city || !resolvedCountryCode)) {
      warnings.push('Location (lat/lon) or city is required for event search.');
    }

    const limit = query.pagination?.limit ?? 40;
    const size = Math.max(1, Math.floor(limit / sizeDivider));
    const page = query.pagination?.page ?? 1;

    // Map requested taxonomy categories (EVENT) to provider-specific filters
    const requestedCategorySlugs: string[] = query.filters?.categorySlugs ?? [];
    const eventCategorySlugs = requestedCategorySlugs.filter((slug) =>
      TAXONOMY_CATEGORIES.some((c) => c.slug === slug && c.type === 'EVENT')
    );

    // Ticketmaster: build classificationName list from segment/genre/subGenre names
    const tmClassificationNames: string[] = [];
    for (const slug of eventCategorySlugs) {
      const refs = (EVENT_TO_TICKETMASTER as any)[slug] as
        | Array<{ segment: string; genre?: string; subGenre?: string }>
        | undefined;
      if (refs && refs.length) {
        for (const r of refs) {
          if (r.segment) tmClassificationNames.push(r.segment);
          if (r.genre) tmClassificationNames.push(r.genre);
          if (r.subGenre) tmClassificationNames.push(r.subGenre);
        }
      }
    }

    // PredictHQ: categories
    const phqCategories: string[] = [];
    for (const slug of eventCategorySlugs) {
      const refs = (EVENT_TO_PREDICTHQ as any)[slug] as Array<{ category: string }> | undefined;
      if (refs && refs.length) {
        for (const r of refs) if (r.category) phqCategories.push(r.category);
      }
    }
    if (eventCategorySlugs.length && !tmClassificationNames.length && !phqCategories.length) {
      warnings.push('Provided event categories could not be mapped to external providers; falling back to broad search.');
    }

    const tasks: Promise<void>[] = [];
    const normalizedEvents: Array<{
      provider: 'TICKETMASTER' | 'PREDICTHQ';
      id: string;
      title: string;
      description?: string;
      url?: string;
      imageUrl?: string;
      location?: { lat: number; lon: number };
      address?: string;
      occurrences?: Array<{ start: string; end?: string; timezone?: string; url?: string }>;
      // enrichment
      priceFrom?: number | null;
      priceTo?: number | null;
      currency?: string | null;
      isOnline?: boolean | null;
      ageLimit?: number | null;
      rank?: number | null;
      localRank?: number | null;
      cityName?: string | null;
      countryCode?: string | null;
      venueId?: string | null;
      venueName?: string | null;
      categoriesRaw?: string[];
    }> = [];

    if (requestedSources.has('TICKETMASTER')) {
      tasks.push(
        (async () => {
          // For Ticketmaster: in CITY mode prefer city+countryCode; in GEO/BBOX use only lat/lon
          const tmParams: any = { q: query.q, fromISO, toISO, page, size, classificationNames: tmClassificationNames };
          if (mode === 'CITY' && city && countryCode) {
            tmParams.city = city;
            tmParams.countryCode = countryCode;
          } else {
            tmParams.lat = lat;
            tmParams.lon = lon;
            tmParams.radiusKm = radiusKm;
          }
          const { items, warning } = await searchTicketmaster(
            tmParams,
            keys.ticketmasterApiKey
          );
          if (warning) warnings.push(warning);
          // Provider already returns unified normalized event structure
          normalizedEvents.push(...(items as any));
        })()
      );
    }

    if (requestedSources.has('PREDICTHQ')) {
      tasks.push(
        (async () => {
          // PredictHQ: always use center + radius (within), even in CITY mode
          // (previously in CITY we used IATA codes; per new requirement we switch to within)
          const phqParams: any = { q: query.q, fromISO, toISO, page, size, categories: phqCategories };
          phqParams.lat = lat;
          phqParams.lon = lon;
          phqParams.radiusKm = radiusKm;
          const { items, warning } = await searchPredictHQ(
            phqParams,
            keys.predicthqToken
          );
          if (warning) warnings.push(warning);
          // Provider already returns a unified normalized event structure
          normalizedEvents.push(...(items as any));
        })()
      );
    }

    await Promise.all(tasks);

    totalEventsCount = normalizedEvents.length;

    // Map unified normalized events to search hits
    const userPoint = lat !== undefined && lon !== undefined ? { lat, lon } : null;
    hits = normalizedEvents.map<Hit>((ev) => {
      const next = ev.occurrences?.[0];
      const nextStartsAtISO = next?.start ? safeISO(next.start) : undefined;
      const primaryCategory = ev.categoriesRaw
        ? mapCategoryToTaxonomy(ev.categoriesRaw.filter(Boolean) as string[])
        : null;
      const distanceKm = userPoint && ev.location ? haversineKm(userPoint, ev.location) : undefined;
      const priceTier = derivePriceTier({ from: ev.priceFrom ?? undefined, to: ev.priceTo ?? undefined }) ?? null;
      const scores: any = {};
      if (ev.rank != null) scores.rank = ev.rank;
      if (distanceKm != null) scores.distance = distanceKm;

      const citySummary = ev.cityName && ev.countryCode
        ? {
            id: `${(ev.countryCode || '').toUpperCase()}:${(ev.cityName || '').toLowerCase().replace(/\s+/g, '_')}`,
            code: `${(ev.countryCode || '').toUpperCase()}_${(ev.cityName || '').toUpperCase().replace(/\s+/g, '_')}`,
            name: ev.cityName,
            countryCode: (ev.countryCode || '').toUpperCase(),
          }
        : null;

      return {
        type: 'event',
        id: `${ev.provider.toLowerCase()}:${ev.id}`,
        title: ev.title,
        description: ev.description ?? null,
        city: citySummary,
        primaryCategory,
        location: ev.location ?? null,
        distanceKm,
        priceTier,
        rating: null,
        reviewCount: null,
        imageUrl: ev.imageUrl ?? null,
        sourceType: 'API',
        sources: [{ source: ev.provider, externalId: String(ev.id), url: ev.url }],
        url: ev.url,
        address: ev.address,
        scores,
        isOnline: ev.isOnline ?? undefined,
        nextOccurrence: next
          ? (() => {
              const startsAt = nextStartsAtISO || next!.start;
              const expected = resolveExpectedDurationForEvent(primaryCategory?.slug);
              const endsAtExisting = safeISO(next?.end) || next?.end || null;
              const endsAt = endsAtExisting || addMinutesISO(startsAt, expected);
              return {
                id: `${ev.provider.toLowerCase()}:${ev.id}:0`,
                startsAt,
                endsAt,
                timezone: next?.timezone,
                weekday: computeWeekday(startsAt),
                location: ev.location ?? null,
                place: ev.venueId ? { id: '00000000-0000-0000-0000-000000000000', name: ev.venueName || undefined } : null,
              };
            })()
          : null,
        occurrences: ev.occurrences?.map((o) => ({
          start: safeISO(o.start) || o.start,
          end: (() => {
            const startISO = safeISO(o.start) || o.start;
            const endISO = safeISO(o.end) || o.end;
            if (endISO) return endISO;
            const expected = resolveExpectedDurationForEvent(primaryCategory?.slug);
            return addMinutesISO(startISO, expected);
          })(),
          location: ev.location ? { lat: ev.location.lat, lon: ev.location.lon } : undefined,
          venueId: ev.venueId || undefined,
          timezone: o.timezone,
          url: o.url,
        })),
        priceFrom: ev.priceFrom ?? null,
        priceTo: ev.priceTo ?? null,
        currency: ev.currency ?? undefined,
        isFree: ev.priceFrom === 0 ? true : undefined,
        ageLimit: ev.ageLimit ?? undefined,
        ticketsUrl: ev.url,
        categoryMeta: ev.categoriesRaw ? { raw: ev.categoriesRaw } : undefined,
      } as any;
    });
  }

  if (shouldQueryPlaces) {
    // Compute effective place query params per mode
    let lat: number | undefined;
    let lon: number | undefined;
    let radiusKm: number = 5;
    let rect: { minLon: number; minLat: number; maxLon: number; maxLat: number } | undefined;
    let cityStr: string | undefined; // for Google/Foursquare text modes

    if (mode === 'GEO') {
      lat = query.where.geo!.lat;
      lon = query.where.geo!.lon;
      radiusKm = query.where.geo!.radiusKm ?? 5;
    } else if (mode === 'BBOX') {
      const bbox = query.where.bbox!;
      rect = { minLon: bbox.west, minLat: bbox.south, maxLon: bbox.east, maxLat: bbox.north };
      // Also compute center+radius for providers that don't support rect
      const centerLat = (bbox.south + bbox.north) / 2;
      const centerLon = (bbox.west + bbox.east) / 2;
      const diagKm = haversineKm({ lat: bbox.south, lon: bbox.west }, { lat: bbox.north, lon: bbox.east }) || 10;
      const halfDiagKm = Math.max(1, Math.min(50, Math.round(diagKm / 2)));
      lat = centerLat;
      lon = centerLon;
      radiusKm = halfDiagKm;
    } else {
      // CITY
      if (resolvedCityName && resolvedCountryCode) cityStr = `${resolvedCityName}, ${resolvedCountryCode.toUpperCase()}`;
      // For Geoapify in CITY mode: use center + radius (circle) instead of rect, as rect may yield empty results
      if (query.where.city?.id != null) {
        const cityObj = geoService.getCityById(query.where.city.id);
        if (cityObj?.coordinates) {
          lat = cityObj.coordinates.lat;
          lon = cityObj.coordinates.lon;
        }
        // Do NOT set rect here intentionally
      }
      radiusKm = resolvedRadiusKm ?? 5;
    }
    if (mode !== 'BBOX' && (lat === undefined || lon === undefined)) {
      warnings.push('Location (lat/lon) is recommended for places search.');
    }

    const limit = query.pagination?.limit ?? 40;
    const size = Math.max(1, Math.floor(limit / sizeDivider));
    const page = query.pagination?.page ?? 1; // not used by providers currently

    const placeCategorySlugs = query.filters?.categorySlugs as readonly string[] | undefined;
    const tasks: Promise<void>[] = [];
    const normalizedPlaces: Array<{
      provider: 'GEOAPIFY' | 'GOOGLE_PLACES' | 'FOURSQUARE';
      id: string;
      title: string;
      description?: string;
      url?: string;
      imageUrl?: string | null;
      location?: { lat: number; lon: number };
      address?: string;
      rating?: number | null;
      reviewCount?: number | null;
      openNow?: boolean;
      categoriesRaw?: string[];
    }> = [];

    if (requestedSources.has('GEOAPIFY')) {
      tasks.push(
        (async () => {
          const { items, warning } = await searchGeoapify({ lat, lon, radiusKm, q: query.q, placeCategorySlugs, size, rect }, keys.geoapifyApiKey);
          if (warning) warnings.push(warning);
          normalizedPlaces.push(...(items as any));
        })()
      );
    }

    if (requestedSources.has('GOOGLE_PLACES')) {
      tasks.push(
        (async () => {
          // In CITY mode without coordinates, switch to Text Search with a city-aware query
          let gQuery = query.q;
          let gLat = lat;
          let gLon = lon;
          let gRadius = radiusKm;
          if (mode === 'CITY' && (gLat == null || gLon == null) && cityStr) {
            gQuery = gQuery ? `${gQuery} in ${cityStr}` : `in ${cityStr}`;
          }
          const { items, warning } = await searchGooglePlaces({ lat: gLat, lon: gLon, radiusKm: gRadius, q: gQuery, placeCategorySlugs, size }, keys.googlePlacesApiKey);
          if (warning) warnings.push(warning);
          normalizedPlaces.push(...(items as any));
        })()
      );
    }

    if (requestedSources.has('FOURSQUARE')) {
      tasks.push(
        (async () => {
          const near = (mode === 'CITY' && cityStr && (lat == null || lon == null)) ? cityStr : undefined;
          const { items, warning } = await searchFoursquarePlaces({ lat, lon, radiusKm, q: query.q, placeCategorySlugs, size, near }, keys.foursquareApiKey);
          if (warning) warnings.push(warning);
          normalizedPlaces.push(...(items as any));
        })()
      );
    }

    await Promise.all(tasks);
    totalPlacesCount = normalizedPlaces.length;

    const userPoint = lat !== undefined && lon !== undefined ? { lat, lon } : null;
    const placeHits = normalizedPlaces.map<Hit>((p: any) => {
      const primaryCategory = p.categoriesRaw ? mapCategoryToTaxonomy(p.categoriesRaw.filter(Boolean) as string[]) : null;
      const distanceKm = userPoint && p.location ? haversineKm(userPoint, p.location) : undefined;
      const scores: any = {};
      if (distanceKm != null) scores.distance = distanceKm;
      const expectedDuration = resolveExpectedDurationForPlace(primaryCategory?.slug);
      return {
        type: 'place',
        id: `${String(p.provider).toLowerCase()}:${p.id}`,
        title: p.title,
        description: p.description ?? null,
        city: null,
        primaryCategory,
        location: p.location ?? null,
        distanceKm,
        priceTier: null,
        rating: p.rating ?? null,
        reviewCount: p.reviewCount ?? null,
        imageUrl: p.imageUrl ?? null,
        sourceType: 'API',
        sources: [{ source: p.provider, externalId: String(p.id), url: p.url }],
        url: p.url,
        address: p.address,
        scores,
        expectedDuration,
        categoryMeta: p.categoriesRaw ? { raw: p.categoriesRaw } : undefined,
      } as any;
    });

    hits.push(...placeHits);
  }

  // Sorting
  const sort = query.sort || 'rank';
  const userPoint2 = query.where.geo ? { lat: query.where.geo.lat, lon: query.where.geo.lon } : null;
  hits.sort((a: any, b: any) => {
    const getStart = (h: any) => (h.nextOccurrence?.startsAt ? new Date(h.nextOccurrence.startsAt).getTime() : Number.MAX_SAFE_INTEGER);
    const getPriceFrom = (h: any) => h.priceFrom ?? Number.NaN;
    const getRating = (h: any) => h.rating ?? Number.NaN;
    const getRank = (h: any) => h.scores?.rank ?? Number.NaN;
    const getDistance = (h: any) => {
      if (!userPoint2 || !h.location) return Number.NaN;
      return haversineKm(userPoint2, h.location) ?? Number.NaN;
    };
    switch (sort) {
      case 'start_time':
        return getStart(a) - getStart(b);
      case 'distance':
        return getDistance(a) - getDistance(b);
      case 'price_asc':
        return getPriceFrom(a) - getPriceFrom(b);
      case 'price_desc':
        return getPriceFrom(b) - getPriceFrom(a);
      case 'rating':
        return getRating(b) - getRating(a);
      case 'rank':
      default:
        return getRank(b) - getRank(a);
    }
  });

  // Pagination
  const total = hits.length;
  const limit = query.pagination?.limit ?? 40;
  const page = query.pagination?.page ?? 1;
  const offset = (page - 1) * limit;
  const pagedItems = hits.slice(offset, offset + limit);

  // Facets
  const categoryCounts = new Map<string, number>();
  const priceTierCounts = new Map<string, number>();
  for (const it of hits as any[]) {
    const cat = it.primaryCategory?.slug as string | undefined;
    if (cat) categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
    const tier = it.priceTier as string | undefined;
    if (tier) priceTierCounts.set(tier, (priceTierCounts.get(tier) || 0) + 1);
  }
  const facets = {
    categories: categoryCounts.size ? Array.from(categoryCounts.entries()).map(([key, count]) => ({ key, count })) : undefined,
    priceTier: priceTierCounts.size ? Array.from(priceTierCounts.entries()).map(([key, count]) => ({ key, count })) : undefined,
  } as any;

  // bbox: compute from items
  const coords = (hits as any[]).map((h) => h.location).filter(Boolean) as { lat: number; lon: number }[];
  let bbox: { south: number; west: number; north: number; east: number } | undefined;
  if (coords.length) {
    const lats = coords.map((c) => c.lat);
    const lons = coords.map((c) => c.lon);
    bbox = { south: Math.min(...lats), west: Math.min(...lons), north: Math.max(...lats), east: Math.max(...lons) };
  }

  const response = {
    queryId: `${Date.now()}`,
    total,
    pagination: { limit, offset, page },
    tookMs: Date.now() - started,
    warnings: warnings.length ? warnings : undefined,
    meta: {
      target: query.target,
      totalEvents: totalEventsCount || undefined,
      totalPlaces: totalPlacesCount || undefined,
      effectiveFilters: {
        when: query.when,
        budget: query.budget,
        mood: query.mood,
        transport: query.filters?.transport,
      },
    },
    bbox,
    facets,
    items: pagedItems,
  };

  // Validate against schema to guarantee shape
  return searchResponseSchema.parse(response);
}

// New: DB-backed search using ingested data
export async function searchUnifiedFromDb(
  query: SearchRequest,
  prisma: PrismaClient
): Promise<SearchResponse> {
  const started = Date.now();
  const warnings: string[] = [];

  const { fromISO, toISO } = resolveTimeWindow(query);

  const shouldQueryEvents = query.target === 'events' || query.target === 'both';
  const shouldQueryPlaces = query.target === 'places' || query.target === 'both';

  // Resolve location for distance
  const hasGeo = !!query.where.geo && query.where.geo.lat != null && query.where.geo.lon != null;
  const center = hasGeo ? { lat: query.where.geo!.lat, lon: query.where.geo!.lon } : undefined;

  // Extract basic filters
  const filterCategories = query.filters?.categorySlugs && query.filters.categorySlugs.length ? Array.from(new Set(query.filters.categorySlugs)) : undefined;
  const filterSources = query.filters?.sources && query.filters.sources.length ? Array.from(new Set(query.filters.sources)) : undefined;
  const filterPriceTier = query.budget?.tier && query.budget.tier !== 'ANY' ? query.budget.tier : undefined;
  // Note: openNowOnly and other advanced filters are not applied yet in MVP

  // Fetch candidates from DB
  const dbCityId = query.where?.city?.id != null ? String(query.where.city.id) : undefined;
  const candidatesPlaces = shouldQueryPlaces
    ? await prisma.place.findMany({
        where: {
          isActive: true,
          moderation: 'APPROVED' as any,
          ...(dbCityId ? { cityId: dbCityId } : {}),
          ...(SEARCH_ONLY_WITH_PHOTOS ? { imageUrl: { not: null } as any } : {}),
          ...(filterPriceTier ? { priceTier: filterPriceTier as any } : {}),
          ...(filterSources ? { sources: { some: { source: { in: filterSources as any } } } } : {}),
          ...(filterCategories
            ? {
                OR: [
                  { mainCategory: { is: { key: { in: filterCategories as any } } } as any },
                  { categories: { some: { category: { key: { in: filterCategories as any } } } } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          name: true,
          description: true,
          cityId: true,
          city: { select: { id: true, name: true, countryCode: true, codeIATA: true } as any },
          lat: true,
          lng: true,
          address: true,
          url: true,
          imageUrl: true,
          mainCategory: { select: { id: true, key: true, title: true } as any },
          popularityScore: true,
          qualityScore: true,
          freshnessScore: true,
          reviewCount: true,
          rating: true,
          priceTier: true,
          provider: true,
          providerCategories: true,
          openingHours: true,
          sources: { select: { source: true, externalId: true, url: true } as any },
          categories: { select: { category: { select: { key: true, title: true } as any } } },
        },
        take: 100,
      })
    : [];

  const timeWhere: any = {};
  if (fromISO) timeWhere.gte = new Date(fromISO);
  if (toISO) timeWhere.lte = new Date(toISO);

  const candidatesEvents = shouldQueryEvents
    ? await prisma.event.findMany({
        where: {
          isActive: true,
          moderation: 'APPROVED' as any,
          occurrences: { some: { startTime: timeWhere } },
          ...(dbCityId ? { cityId: dbCityId } : {}),
          ...(SEARCH_ONLY_WITH_PHOTOS ? { imageUrl: { not: null } as any } : {}),
          ...(filterPriceTier ? { priceTier: filterPriceTier as any } : {}),
          ...(filterSources ? { sources: { some: { source: { in: filterSources as any } } } } : {}),
          ...(filterCategories
            ? {
                OR: [
                  { mainCategory: { is: { key: { in: filterCategories as any } } } as any },
                  { categories: { some: { category: { key: { in: filterCategories as any } } } } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          title: true,
          description: true,
          imageUrl: true,
          cityId: true,
          city: { select: { id: true, name: true, countryCode: true, codeIATA: true } as any },
          mainCategory: { select: { id: true, key: true, title: true } as any },
          popularityScore: true,
          qualityScore: true,
          freshnessScore: true,
          priceTier: true,
          priceFrom: true,
          priceTo: true,
          currency: true,
          isOnline: true,
          ageLimit: true,
          languages: true,
          ticketsUrl: true,
          provider: true,
          providerCategories: true,
          sources: { select: { source: true, externalId: true, url: true } as any },
          categories: { select: { category: { select: { key: true, title: true } as any } } },
          occurrences: {
            where: { startTime: timeWhere },
            orderBy: { startTime: 'asc' },
            take: 1,
            select: {
              id: true,
              startTime: true,
              endTime: true,
              timezone: true,
              lat: true,
              lng: true,
              url: true,
              place: { select: { id: true, name: true, lat: true, lng: true } as any },
            },
          },
        },
        take: 100,
      })
    : [];

  // Ranking params
  const composeRank = (pop?: number | null, qual?: number | null, fresh?: number | null, distanceKm?: number) => {
    const popularity = pop ?? 0;
    const quality = qual ?? 0;
    const freshness = fresh ?? 0;
    const base = 0.35 * popularity + 0.4 * quality + 0.25 * freshness;
    const dist = distanceKm ?? (hasGeo ? 9999 : 0);
    const distanceFactor = hasGeo ? Math.exp(-(dist) / 10) : 1; // penalty by ~10km scale
    return base * distanceFactor;
  };

  // Map places to hits
  type Hit = z.infer<typeof searchHitSchema>;
  const placeHits: Hit[] = candidatesPlaces.map((p: any) => {
    const loc = p.lat != null && p.lng != null ? { lat: Number(p.lat), lon: Number(p.lng) } : null;
    const distanceKm = center && loc ? (haversineKm(center, loc) || undefined) : undefined;
    const rank = composeRank(p.popularityScore, p.qualityScore, p.freshnessScore, distanceKm);
    const primaryCatSlug = (p.mainCategory as any)?.key as string | undefined;
    const expectedDuration = resolveExpectedDurationForPlace(primaryCatSlug ?? 'place.other');
    // City object
    const cityObj = p.city
      ? {
          id: p.city.id,
          code: p.city.codeIATA ?? p.city.id,
          name: p.city.name,
          countryCode: p.city.countryCode,
        }
      : null;
    // Categories array
    const categoriesArr = Array.isArray(p.categories)
      ? p.categories.map((c: any) => ({ slug: c.category.key as string, type: 'PLACE' as const, name: c.category.title as string | undefined }))
      : [];
    // Sources array
    const sourcesArr = Array.isArray(p.sources)
      ? p.sources.map((s: any) => ({ source: s.source, externalId: String(s.externalId), url: s.url ?? undefined }))
      : undefined;
    // Choose url: use first source url if present
    const firstSourceUrl: string | undefined = Array.isArray(p.sources) && p.sources.length ? (p.sources[0]?.url ?? undefined) : undefined;
    const placeUrl: string | undefined = p.url ?? undefined;
    // categoryMeta.raw from providerCategories
    const rawCats = typeof p.providerCategories === 'string' && p.providerCategories.length
      ? p.providerCategories.split(',').map((s: string) => s.trim()).filter((s: string) => s.length)
      : undefined;
    const categoryMeta = rawCats && rawCats.length ? { raw: rawCats } : undefined;
    const sourceType = mapSourceType(p.provider as SourceType | undefined);
    return {
      id: p.id,
      type: 'place',
      title: p.name || 'Place',
      description: p.description ?? null,
      city: cityObj,
      primaryCategory: primaryCatSlug ? { slug: primaryCatSlug, type: 'PLACE', name: (p.mainCategory as any)?.title } : null,
      categories: categoriesArr,
      cardType: undefined,
      address: p.address || undefined,
      location: loc,
      distanceKm,
      indoorOutdoor: undefined,
      priceTier: (p.priceTier as any) ?? null,
      rating: p.rating ?? null,
      reviewCount: p.reviewCount ?? null,
      imageUrl: p.imageUrl ?? null,
      photos: [],
      sourceType,
      sourceProvider: p.provider ?? undefined,
      sources: sourcesArr,
      url: placeUrl ?? firstSourceUrl ?? undefined,
      scores: { rank, popularity: p.popularityScore ?? undefined, quality: p.qualityScore ?? undefined, distance: distanceKm },
      openingHours: undefined,
      openNow: undefined,
      openUntil: undefined,
      expectedDuration,
      categoryMeta,
    } as any as Hit;
  });

  // Helper: map provider to response-level sourceType (use function declaration to avoid TDZ issues)
  function mapSourceType(p?: SourceType | null): 'API' | 'PARTNER' | 'MANUAL' | 'INTERNAL' {
    if (!p) return 'API';
    if (p === 'PARTNER') return 'PARTNER';
    if (p === 'MANUAL') return 'MANUAL';
    // External APIs → API
    return 'API';
  }

  // Map events to hits
  const eventHits: Hit[] = candidatesEvents.map((e: any) => {
    const occ = Array.isArray(e.occurrences) && e.occurrences.length ? e.occurrences[0] : undefined;
    const occLoc = occ
      ? (occ.lat != null && occ.lng != null
          ? { lat: Number(occ.lat), lon: Number(occ.lng) }
          : (occ.place && occ.place.lat != null && occ.place.lng != null
              ? { lat: Number(occ.place.lat), lon: Number(occ.place.lng) }
              : null))
      : null;
    const distanceKm = center && occLoc ? (haversineKm(center, occLoc) || undefined) : undefined;
    const rank = composeRank(e.popularityScore, e.qualityScore, e.freshnessScore, distanceKm);
    const primaryCatSlug = (e.mainCategory as any)?.key as string | undefined;
    // City object
    const cityObj = e.city
      ? {
          id: e.city.id,
          code: e.city.codeIATA ?? e.city.id,
          name: e.city.name,
          countryCode: e.city.countryCode,
        }
      : null;
    // Categories array (excluding primary duplication is ok for now)
    const categoriesArr = Array.isArray(e.categories)
      ? e.categories
          .map((c: any) => ({ slug: c.category.key as string, type: 'EVENT' as const, name: c.category.title as string | undefined }))
      : [];
    // Sources array
    const sourcesArr = Array.isArray(e.sources)
      ? e.sources.map((s: any) => ({ source: s.source, externalId: String(s.externalId), url: s.url ?? undefined }))
      : undefined;
    // Choose url/ticketsUrl: prefer occurrence.url, fallback to event.ticketsUrl, then first source url
    const firstSourceUrl: string | undefined = Array.isArray(e.sources) && e.sources.length ? (e.sources[0]?.url ?? undefined) : undefined;
    const url = occ?.url ?? e.ticketsUrl ?? firstSourceUrl;
    const ticketsUrl = url ?? e.ticketsUrl ?? firstSourceUrl;
    // categoryMeta.raw from providerCategories (comma-separated string)
    const rawCats = typeof e.providerCategories === 'string' && e.providerCategories.length
      ? e.providerCategories.split(',').map((s: string) => s.trim()).filter((s: string) => s.length)
      : undefined;
    const categoryMeta = rawCats && rawCats.length ? { raw: rawCats } : undefined;
    const sourceType = mapSourceType(e.provider as SourceType | undefined);
    const nextOccurrence = occ
      ? {
          id: occ.id,
          startsAt: occ.startTime.toISOString(),
          endsAt: occ.endTime ? occ.endTime.toISOString() : undefined,
          timezone: occ.timezone ?? undefined,
          weekday: computeWeekday(occ.startTime.toISOString()),
          location: occLoc,
          place: occ.place ? { id: occ.place.id, name: occ.place.name ?? undefined } : null,
        }
      : null;
    return {
      id: e.id,
      type: 'event',
      title: e.title || 'Event',
      description: e.description ?? null,
      city: cityObj,
      primaryCategory: primaryCatSlug ? { slug: primaryCatSlug, type: 'EVENT', name: (e.mainCategory as any)?.title } : null,
      categories: categoriesArr,
      cardType: undefined,
      address: undefined,
      location: occLoc,
      distanceKm,
      indoorOutdoor: undefined,
      priceTier: (e.priceTier as any) ?? null,
      rating: undefined,
      reviewCount: undefined,
      imageUrl: e.imageUrl ?? null,
      photos: [],
      sourceType,
      sourceProvider: e.provider ?? undefined,
      sources: sourcesArr,
      url: url ?? undefined,
      scores: { rank, popularity: e.popularityScore ?? undefined, quality: e.qualityScore ?? undefined, distance: distanceKm },
      isOnline: typeof e.isOnline === 'boolean' ? e.isOnline : undefined,
      nextOccurrence,
      occurrences: undefined,
      priceFrom: e.priceFrom ?? null,
      priceTo: e.priceTo ?? null,
      currency: e.currency ?? undefined,
      isFree: e.priceFrom === 0 ? true : undefined,
      languages: Array.isArray(e.languages) && e.languages.length ? (e.languages as any) : undefined,
      ageLimit: typeof e.ageLimit === 'number' ? e.ageLimit : undefined,
      ticketsUrl: ticketsUrl ?? undefined,
      categoryMeta,
    } as any as Hit;
  });

  let hits: Hit[] = [];
  if (query.target === 'events') hits = eventHits;
  else if (query.target === 'places') hits = placeHits;
  else hits = [...eventHits, ...placeHits];

  // Sorting
  const sortMode = query.sort ?? 'rank';
  const priceWeight: Record<string, number> = { FREE: 1, CHEAP: 2, MODERATE: 3, EXPENSIVE: 4 };
  if (sortMode === 'distance' && hasGeo) {
    hits.sort((a: any, b: any) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  } else if (sortMode === 'start_time') {
    // Events by nextOccurrence.startsAt asc; places fallback by rank
    const timeOf = (h: any) => (h.type === 'event' && h.nextOccurrence?.startsAt ? Date.parse(h.nextOccurrence.startsAt) : Number.POSITIVE_INFINITY);
    hits.sort((a: any, b: any) => {
      const ta = timeOf(a);
      const tb = timeOf(b);
      if (ta !== tb) return ta - tb;
      return (b.scores?.rank ?? 0) - (a.scores?.rank ?? 0);
    });
  } else if (sortMode === 'price_asc' || sortMode === 'price_desc') {
    const dir = sortMode === 'price_asc' ? 1 : -1;
    hits.sort((a: any, b: any) => {
      const wa = a.priceTier ? priceWeight[a.priceTier] ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
      const wb = b.priceTier ? priceWeight[b.priceTier] ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
      if (wa !== wb) return dir * (wa - wb);
      return (b.scores?.rank ?? 0) - (a.scores?.rank ?? 0);
    });
  } else if (sortMode === 'rating') {
    hits.sort((a: any, b: any) => {
      const ra = a.rating ?? -1;
      const rb = b.rating ?? -1;
      if (rb !== ra) return rb - ra;
      const rca = a.reviewCount ?? 0;
      const rcb = b.reviewCount ?? 0;
      if (rcb !== rca) return rcb - rca;
      return (b.scores?.rank ?? 0) - (a.scores?.rank ?? 0);
    });
  } else {
    // rank
    hits.sort((a: any, b: any) => (b.scores?.rank ?? 0) - (a.scores?.rank ?? 0));
  }

  const total = hits.length;
  const offset = query.pagination?.offset ?? 0;
  const limit = Math.min(100, query.pagination?.limit ?? 20);
  const pageItems = hits.slice(offset, offset + limit);

  // Facets from all hits (pre-paginated)
  const categoryCounts = new Map<string, number>();
  const priceCounts = new Map<string, number>();
  for (const h of hits as any[]) {
    const cat = h.primaryCategory?.slug;
    if (cat) categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
    const pt = h.priceTier;
    if (pt) priceCounts.set(pt, (priceCounts.get(pt) ?? 0) + 1);
  }
  const facets = {
    categories: Array.from(categoryCounts.entries()).map(([key, count]) => ({ key, count })),
    priceTier: Array.from(priceCounts.entries()).map(([key, count]) => ({ key, count })),
  } as any;

  const tookMs = Date.now() - started;
  const resp: SearchResponse = {
    queryId: `${Date.now()}`,
    total,
    pagination: { limit, offset, page: Math.floor(offset / limit) + 1 },
    tookMs,
    warnings: warnings.length ? warnings : undefined,
    meta: {
      target: query.target,
      totalPlaces: placeHits.length,
      totalEvents: eventHits.length,
    },
    facets,
    items: pageItems as any,
  } as any;
  return resp;
}

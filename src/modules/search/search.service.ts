import { z } from 'zod';
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
import { searchGeoapify } from '../ingestion/providers/places/geoapify.provider.js';
import { searchGooglePlaces } from '../ingestion/providers/places/google-places.provider.js';
import { searchFoursquarePlaces } from '../ingestion/providers/places/foursquare.provider.js';
import { EVENT_TO_TICKETMASTER } from '../catalog/taxonomy/mapping.ticketmaster.js';
import { EVENT_TO_PREDICTHQ } from '../catalog/taxonomy/mapping.predicthq.js';
import type { SourceType } from './search.schemas.js';
import { GeoService } from '../geo/geo.service.js';

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
    // default to this weekend
    const d = new Date(now);
    const day = d.getDay();
    const daysUntilFriday = (5 - day + 7) % 7; // 5 = Friday
    const friday = new Date(d);
    friday.setDate(d.getDate() + daysUntilFriday);
    friday.setHours(18, 0, 0, 0);
    const sunday = new Date(friday);
    sunday.setDate(friday.getDate() + 2);
    sunday.setHours(23, 59, 59, 999);
    fromISO = friday.toISOString();
    toISO = sunday.toISOString();
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

// Helpers for expected duration and time computations
function randStepMinutes(min: number, max: number, step: number): number {
  const steps = Math.floor((max - min) / step) + 1;
  const idx = Math.floor(Math.random() * steps);
  return min + idx * step;
}

function addMinutesISO(iso: string, minutes: number): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

function resolveExpectedDurationForEvent(categorySlug?: string | null): number {
  if (!categorySlug || categorySlug === 'event.other') {
    return randStepMinutes(90, 180, 10);
  }
  const cat = TAXONOMY_CATEGORIES.find((c) => c.slug === categorySlug && c.type === 'EVENT');
  if (!cat) return randStepMinutes(90, 180, 10);
  return cat.expected_duration ?? randStepMinutes(90, 180, 10);
}

function resolveExpectedDurationForPlace(categorySlug?: string | null): number {
  if (!categorySlug || categorySlug === 'place.other') {
    return randStepMinutes(60, 120, 10);
  }
  const cat = TAXONOMY_CATEGORIES.find((c) => c.slug === categorySlug && c.type === 'PLACE');
  if (!cat) return randStepMinutes(60, 120, 10);
  return cat.expected_duration ?? randStepMinutes(60, 120, 10);
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

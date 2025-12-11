import type { BaseQuery, EventProvider, PlaceProvider } from "./ingestion.service.js";
import type { SourceType } from "../search/search.schemas.js";
import type { ProviderKeys } from "../search/search.service.js";

// Existing providers
import { searchTicketmaster } from "./providers/events/ticketmaster.provider.js";
import { searchPredictHQ } from "./providers/events/predicthq.provider.js";
import { searchGeoapify } from "./providers/places/geoapify.provider.js";
import { searchGooglePlaces } from "./providers/places/google-places.provider.js";
import { searchFoursquarePlaces } from "./providers/places/foursquare.provider.js";

import type { NormalizedEventLike, NormalizedPlaceLike } from "./dedup.service.js";
import fs from "node:fs";
import path from "node:path";

// Taxonomy mappers for PLACES
import { GEOAPIFY_CATEGORY_RULES } from "../catalog/taxonomy/mapping.geoapify.js";
import { GOOGLE_TYPE_TO_PLACE_CATEGORY, mapGooglePrimaryTypeToPlaceCategory } from "../catalog/taxonomy/mapping.googlePlaces.js";
import { mapFoursquareCategoriesToPlaceCategory } from "../catalog/taxonomy/mapping.foursquare.js";
// Taxonomy mappers for EVENTS
import { TICKETMASTER_TO_EVENT_CATEGORY } from "../catalog/taxonomy/mapping.ticketmaster.js";
import { PREDICTHQ_TO_EVENT_CATEGORY } from "../catalog/taxonomy/mapping.predicthq.js";

// Flag to control saving provider sample responses
const SAVE_PROVIDER_SAMPLES = process.env.INGEST_SAVE_PROVIDER_SAMPLES === 'true';

// Save only the first item from a provider response into logs/response.<PROVIDER>.log
function saveProviderSample(provider: string, firstItem: unknown) {
  if (!SAVE_PROVIDER_SAMPLES) return;
  try {
    if (!firstItem) return;
    const dir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `response.${provider}.log`);
    const payload = JSON.stringify(firstItem, null, 2);
    fs.writeFileSync(file, payload + "\n", "utf8");
  } catch {
    // swallow logging errors silently (diagnostic helper only)
  }
}

// Map provider-normalized events to ingestion NormalizedEventLike
function mapEventToLike(provider: 'TICKETMASTER' | 'PREDICTHQ', ev: any): NormalizedEventLike {
  const firstOcc = Array.isArray(ev.occurrences) && ev.occurrences.length ? ev.occurrences[0] : undefined;
  const src: SourceType = provider;
  // Map provider-specific categories into our taxonomy slugs (primary first)
  let eventCategorySlugs: string[] | undefined = undefined;
  const seen = new Set<string>();
  const pushSlug = (s?: string | null) => { if (s) seen.add(String(s)); };
  if (provider === 'TICKETMASTER') {
    // ev.categoriesRaw contains strings like segment/genre/subGenre names
    const raws: string[] = Array.isArray(ev.categoriesRaw) ? ev.categoriesRaw.map((x: any) => String(x).trim()) : [];
    const rawsLower = new Set(raws.map((x) => x.toLowerCase()));
    // Walk through known reverse rules and check if they are satisfied by raws
    for (const rule of TICKETMASTER_TO_EVENT_CATEGORY) {
      const segOk = rawsLower.has(String(rule.segment).toLowerCase());
      if (!segOk) continue;
      const genreOk = rule.genre ? rawsLower.has(String(rule.genre).toLowerCase()) : true;
      const subOk = rule.subGenre ? rawsLower.has(String(rule.subGenre).toLowerCase()) : true;
      if (genreOk && subOk) pushSlug(rule.category);
    }
  } else if (provider === 'PREDICTHQ') {
    const raws: string[] = Array.isArray(ev.categoriesRaw) ? ev.categoriesRaw.map((x: any) => String(x).trim().toLowerCase()) : [];
    for (const rule of PREDICTHQ_TO_EVENT_CATEGORY) {
      if (raws.includes(rule.category)) pushSlug(rule.our);
    }
  }
  eventCategorySlugs = seen.size ? Array.from(seen) : undefined;
  return {
    title: ev.title,
    description: ev.description ?? null,
    url: ev.url ?? null,
    imageUrl: ev.imageUrl ?? null,
    location: ev.location ? { lat: ev.location.lat, lon: ev.location.lon } : null,
    address: ev.address ?? null,
    cityId: undefined,
    time: firstOcc ? { start: String(firstOcc.start), end: firstOcc.end ? String(firstOcc.end) : undefined, timezone: firstOcc.timezone } : null,
    categories: eventCategorySlugs,
    providerCategoriesRaw: Array.isArray(ev.categoriesRaw) ? ev.categoriesRaw : undefined,
    // extended fields
    priceFrom: ev.priceFrom ?? null,
    priceTo: ev.priceTo ?? null,
    currency: ev.currency ?? null,
    isOnline: ev.isOnline ?? null,
    ageLimit: ev.ageLimit ?? null,
    languages: Array.isArray(ev.languages) ? ev.languages : undefined,
    ticketsUrl: ev.url ?? undefined,
    source: { source: src, externalId: String(ev.id), url: ev.url },
    sourceUpdatedAt: undefined,
  };
}

// Map provider-normalized places to ingestion NormalizedPlaceLike
function mapPlaceToLike(provider: 'GEOAPIFY' | 'GOOGLE_PLACES' | 'FOURSQUARE', p: any): NormalizedPlaceLike {
  const src: SourceType = provider as SourceType;
  const externalId = String(p.id);
  const name = p.title || p.name || '';
  const imageUrl: string | null | undefined = p.imageUrl ?? null;
  const url: string | null | undefined = p.url ?? null;
  const rating: number | null | undefined = p.rating ?? null;
  const reviewCount: number | null | undefined = p.reviewCount ?? null;
  // Derive our taxonomy category slugs (primary first) per provider
  let categorySlugs: string[] | undefined;
  if (provider === 'GEOAPIFY') {
    const raws: string[] = Array.isArray(p.categoriesRaw) ? p.categoriesRaw : [];
    const seen = new Set<string>();
    for (const raw of raws) {
      const rule = GEOAPIFY_CATEGORY_RULES.find((r) => String(raw).startsWith(r.categoryPrefix));
      if (rule && !seen.has(rule.placeCategory)) {
        seen.add(rule.placeCategory);
      }
    }
    categorySlugs = Array.from(seen);
  } else if (provider === 'GOOGLE_PLACES') {
    const raws: string[] = Array.isArray(p.categoriesRaw) ? p.categoriesRaw : [];
    const seen = new Set<string>();
    // Primary by first type
    if (raws.length) {
      const primary = mapGooglePrimaryTypeToPlaceCategory(raws[0]);
      if (primary) seen.add(primary);
    }
    for (const t of raws) {
      const hit = GOOGLE_TYPE_TO_PLACE_CATEGORY.find((r) => r.type === t);
      if (hit) seen.add(hit.category);
    }
    categorySlugs = Array.from(seen);
  } else if (provider === 'FOURSQUARE') {
    // We already compute primary slug in provider
    const primary: string | null | undefined = p.primaryCategorySlug;
    categorySlugs = primary ? [primary] : undefined;
    // If later we expose full mapping for categoriesLite, extend here
  }
  return {
    name,
    location: p.location ? { lat: p.location.lat, lon: p.location.lon } : null,
    address: p.address ?? null,
    url: url ?? null,
    imageUrl: imageUrl ?? null,
    rating: rating ?? null,
    reviewCount: reviewCount ?? null,
    cityId: undefined,
    categories: categorySlugs && categorySlugs.length ? categorySlugs : undefined,
    providerCategoriesRaw: Array.isArray(p.categoriesRaw) ? p.categoriesRaw : undefined,
    source: { source: src, externalId, url: p.url },
    sourceUpdatedAt: undefined,
  };
}

export function buildEventProviders(keys: ProviderKeys, requested: Set<SourceType>): EventProvider[] {
  const providers: EventProvider[] = [];
  if (requested.has('TICKETMASTER')) {
    providers.push({
      name: 'ticketmaster',
      source: 'TICKETMASTER',
      async searchEvents(q: BaseQuery) {
        const { items, warning } = await searchTicketmaster({
          lat: q.lat,
          lon: q.lon,
          radiusKm: q.radiusKm,
          q: q.q,
          city: q.cityName,
          countryCode: q.countryCode,
          fromISO: q.fromISO,
          toISO: q.toISO,
          size: q.size,
        }, keys.ticketmasterApiKey);
        // Save first raw provider-normalized item for diagnostics
        if (items && items.length) saveProviderSample('TICKETMASTER', items[0]);
        const mapped: NormalizedEventLike[] = items.map((e: any) => mapEventToLike('TICKETMASTER', e));
        return { items: mapped, warning };
      },
    });
  }
  if (requested.has('PREDICTHQ')) {
    providers.push({
      name: 'predicthq',
      source: 'PREDICTHQ',
      async searchEvents(q: BaseQuery) {
        const { items, warning } = await searchPredictHQ({
          lat: q.lat,
          lon: q.lon,
          radiusKm: q.radiusKm,
          q: q.q,
          fromISO: q.fromISO,
          toISO: q.toISO,
          size: q.size,
          // Force within-mode by coordinates; do not use IATA
          categories: undefined,
        }, keys.predicthqToken);
        if (items && items.length) saveProviderSample('PREDICTHQ', items[0]);
        const mapped: NormalizedEventLike[] = items.map((e: any) => mapEventToLike('PREDICTHQ', e));
        return { items: mapped, warning };
      },
    });
  }
  return providers;
}

export function buildPlaceProviders(keys: ProviderKeys, requested: Set<SourceType>, options?: { textSearchCityQuery?: string; rect?: { minLon: number; minLat: number; maxLon: number; maxLat: number } }): PlaceProvider[] {
  const providers: PlaceProvider[] = [];
  if (requested.has('GEOAPIFY')) {
    providers.push({
      name: 'geoapify',
      source: 'GEOAPIFY',
      async searchPlaces(q: BaseQuery) {
        const { items, warning } = await searchGeoapify({
          lat: q.lat,
          lon: q.lon,
          radiusKm: q.radiusKm,
          q: q.q,
          size: q.size,
          textSearchCityQuery: options?.textSearchCityQuery,
          rect: options?.rect,
        }, keys.geoapifyApiKey);
        if (items && items.length) saveProviderSample('GEOAPIFY', items[0]);
        const mapped: NormalizedPlaceLike[] = items.map((p: any) => mapPlaceToLike('GEOAPIFY', p));
        return { items: mapped, warning };
      },
    });
  }
  if (requested.has('GOOGLE_PLACES')) {
    providers.push({
      name: 'google-places',
      source: 'GOOGLE_PLACES',
      async searchPlaces(q: BaseQuery) {
        const { items, warning } = await searchGooglePlaces({
          lat: q.lat,
          lon: q.lon,
          radiusKm: q.radiusKm,
          q: q.q,
          size: q.size,
          textSearchCityQuery: options?.textSearchCityQuery,
          rect: options?.rect,
        }, keys.googlePlacesApiKey);
        if (items && items.length) saveProviderSample('GOOGLE_PLACES', items[0]);
        const mapped: NormalizedPlaceLike[] = items.map((p: any) => mapPlaceToLike('GOOGLE_PLACES', p));
        return { items: mapped, warning };
      },
    });
  }
  if (requested.has('FOURSQUARE')) {
    providers.push({
      name: 'foursquare',
      source: 'FOURSQUARE',
      async searchPlaces(q: BaseQuery) {
        const { items, warning } = await searchFoursquarePlaces({
          lat: q.lat,
          lon: q.lon,
          radiusKm: q.radiusKm,
          q: q.q,
          size: q.size,
          near: options?.textSearchCityQuery,
          rect: options?.rect,
        }, keys.foursquareApiKey);
        if (items && items.length) saveProviderSample('FOURSQUARE', items[0]);
        const mapped: NormalizedPlaceLike[] = items.map((p: any) => mapPlaceToLike('FOURSQUARE', p));
        return { items: mapped, warning };
      },
    });
  }
  return providers;
}

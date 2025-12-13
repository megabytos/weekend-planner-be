// Google Places provider
// Docs: https://developers.google.com/maps/documentation/places/web-service/search-nearby

import type { PlaceQuery } from './geoapify.provider.js';
import { getGooglePlaceTypesForPlaceCategories } from '../../../catalog/taxonomy/mapping.googlePlaces.js';

export type GoogleNormalizedPlace = {
  provider: 'GOOGLE_PLACES';
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
};

const GP_BASE_NEARBY = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
const GP_BASE_TEXT = 'https://maps.googleapis.com/maps/api/place/textsearch/json';

// Diagnostics: save raw first item
import fs from 'node:fs';
import path from 'node:path';
import { IngestLogger } from '../../ingest.logger.js';
const SAVE_RAW = process.env.INGEST_SAVE_PROVIDER_RAW_SAMPLES === 'true';
function saveRawSample(provider: string, firstItem: unknown) {
  if (!SAVE_RAW || !firstItem) return;
  try {
    const dir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `rawResponse.${provider}.log`);
    fs.writeFileSync(file, JSON.stringify(firstItem, null, 2) + '\n', 'utf8');
  } catch {
    // ignore diagnostics errors
  }
}

// Shared logger instance for provider diagnostics
const providersLogger = new IngestLogger();

export async function searchGooglePlaces(query: PlaceQuery, apiKey?: string): Promise<{ items: GoogleNormalizedPlace[]; total?: number; warning?: string }> {
  if (!apiKey) return { items: [], warning: 'Google Places API key is missing' };

  // Prefer Nearby Search when we have location, otherwise Text Search
  const hasLoc = query.lat != null && query.lon != null;
  const base = hasLoc ? GP_BASE_NEARBY : GP_BASE_TEXT;
  const url = new URL(base);
  url.searchParams.set('key', apiKey);
  const radiusM = Math.round((query.radiusKm ?? 5) * 1000);
  const limit = Math.min(50, Math.max(1, query.size ?? 20));
  // Google uses pagetoken for pagination; for now, fetch first page only honoring limit via our slicing later

  if (hasLoc) {
    url.searchParams.set('location', `${query.lat},${query.lon}`);
    url.searchParams.set('radius', String(radiusM));
  }
  if (query.q) url.searchParams.set(hasLoc ? 'keyword' : 'query', query.q);

  // Types filter (acts as OR for multiple requests, but we can pass one primary type only).
  const types = getGooglePlaceTypesForPlaceCategories(query.placeCategorySlugs as any);
  if (types.length) {
    // Choose up to one type to restrict; Google Nearby supports only one 'type' param.
    url.searchParams.set('type', types[0]);
  }

  // Log outgoing provider request (mask key)
  try {
    const urlForLog = new URL(url.toString());
    urlForLog.searchParams.set('key', '***');
    const msg = `[provider][GOOGLE_PLACES] request: ${urlForLog.toString()}`;
    // eslint-disable-next-line no-console
    console.log(msg);
    providersLogger.log(msg);
    providersLogger.flushToFile(false);
  } catch {}

  try {
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!res.ok) return { items: [], warning: `Google Places HTTP ${res.status}` };
    const data: any = await res.json();
    const results: any[] = data?.results ?? [];
    // Save raw first item for diagnostics
    if (results.length) saveRawSample('GOOGLE_PLACES', results[0]);
    const items: GoogleNormalizedPlace[] = results.slice(0, limit).map((r: any) => {
      const id = String(r.place_id);
      const title = r.name || 'Place';
      const address = r.vicinity || r.formatted_address;
      const loc = r.geometry?.location ? { lat: Number(r.geometry.location.lat), lon: Number(r.geometry.location.lng) } : undefined;
      const rating = r.rating != null ? Number(r.rating) : null;
      const reviewCount = r.user_ratings_total != null ? Number(r.user_ratings_total) : null;
      const photoRef = r.photos?.[0]?.photo_reference;
      const imageUrl = photoRef ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${encodeURIComponent(photoRef)}&key=${apiKey}` : null;
      const categoriesRaw: string[] | undefined = Array.isArray(r.types) ? r.types.map((t: any) => String(t)) : undefined;
      // Web URL would require a details request; skip to keep quota low
      return {
        provider: 'GOOGLE_PLACES',
        id,
        title,
        description: undefined,
        url: undefined,
        imageUrl,
        location: loc,
        address: address || undefined,
        rating,
        reviewCount,
        openNow: r.opening_hours?.open_now ?? undefined,
        categoriesRaw,
      };
    });
    return { items };
  } catch (e: any) {
    return { items: [], warning: `Google Places error: ${e?.message || 'unknown'}` };
  }
}

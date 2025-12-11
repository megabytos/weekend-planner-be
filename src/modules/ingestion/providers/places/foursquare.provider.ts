// Foursquare Places provider
// Docs: https://docs.foursquare.com/places/reference/search

import type { PlaceQuery } from './geoapify.provider.js';
import { mapFoursquareCategoriesToPlaceCategory, type FoursquareCategoryLite } from '../../../catalog/taxonomy/mapping.foursquare.js';

export type FoursquareNormalizedPlace = {
  provider: 'FOURSQUARE';
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
  categoriesLite?: FoursquareCategoryLite[];
  categoriesRaw?: string[];
  primaryCategorySlug?: string | null;
};

const FSQ_BASE = 'https://places-api.foursquare.com/places/search';

// Diagnostics: save raw first item
import fs from 'node:fs';
import path from 'node:path';
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

export async function searchFoursquarePlaces(query: PlaceQuery, apiKey?: string): Promise<{ items: FoursquareNormalizedPlace[]; total?: number; warning?: string }> {
  if (!apiKey) return { items: [], warning: 'Foursquare API key is missing' };

  const url = new URL(FSQ_BASE);
  const limit = Math.min(50, Math.max(1, query.size ?? 20));
  url.searchParams.set('limit', String(limit));

  // Prefer 'near' (city text) when provided explicitly and there are no explicit coordinates
  if (query.near && !(query.lat != null && query.lon != null)) {
    url.searchParams.set('near', query.near);
  } else if (query.lat != null && query.lon != null) {
    url.searchParams.set('ll', `${query.lat},${query.lon}`);
    const radiusM = Math.round((query.radiusKm ?? 5) * 1000);
    url.searchParams.set('radius', String(radiusM));
  }
  if (query.q) url.searchParams.set('query', query.q);

  try {
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}`, 'X-Places-Api-Version': '2025-06-17' } });
    if (!res.ok) return { items: [], warning: `Foursquare HTTP ${res.status}` };
    const data: any = await res.json();
    const results: any[] = data?.results ?? [];
    // Save raw first item for diagnostics
    if (results.length) saveRawSample('FOURSQUARE', results[0]);
    const items: FoursquareNormalizedPlace[] = results.map((r: any) => {
      // Foursquare may return different shapes depending on API/version or fields
      // Prefer fsq_id, but fallback to fsq_place_id (observed in raw samples)
      const rawId = r.fsq_id ?? r.fsq_place_id;
      const id = String(rawId);
      const title = r.name || 'Place';
      // Coordinates can be either in geocodes.main or as top-level latitude/longitude
      const lat = r.geocodes?.main?.latitude ?? r.latitude;
      const lon = r.geocodes?.main?.longitude ?? r.longitude;
      const loc = (lat != null && lon != null) ? { lat: Number(lat), lon: Number(lon) } : undefined;
      // Address may come as structured fields or formatted string
      const formatted = r.location?.formatted_address;
      const composed = r.location ? [r.location.address, r.location.locality, r.location.country].filter(Boolean).join(', ') : undefined;
      const addr = formatted || composed;
      const categoriesLite: FoursquareCategoryLite[] = Array.isArray(r.categories)
        ? r.categories.map((c: any) => ({ id: String(c.id), name: String(c.name), shortName: c.short_name ? String(c.short_name) : undefined }))
        : [];
      const categoriesRaw = categoriesLite.map((c) => c.name);
      const primaryCategorySlug = mapFoursquareCategoriesToPlaceCategory(categoriesLite as any);
      return {
        provider: 'FOURSQUARE',
        id,
        title,
        description: undefined,
        url: r.website || undefined,
        imageUrl: null,
        location: loc,
        address: addr,
        rating: null,
        reviewCount: null,
        openNow: undefined,
        categoriesLite,
        categoriesRaw,
        primaryCategorySlug,
      };
    });
    return { items };
  } catch (e: any) {
    return { items: [], warning: `Foursquare error: ${e?.message || 'unknown'}` };
  }
}

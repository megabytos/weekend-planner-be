// Geoapify Places provider
// Docs: https://apidocs.geoapify.com/docs/places/

import { getGeoapifyCategoriesForPlaceCategories } from '../../../catalog/taxonomy/mapping.geoapify.js';

export type PlaceQuery = {
  lat?: number;
  lon?: number;
  radiusKm?: number;
  q?: string;
  placeCategorySlugs?: readonly string[]; // internal taxonomy slugs
  page?: number;
  size?: number;
  openNow?: boolean;
  // Additional search modes
  // Rectangular bounding box (bbox) in lon/lat format
  rect?: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  // For Google Text Search (city text mode) and Foursquare `near`, passed through the shared type
  textSearchCityQuery?: string;
  near?: string;
};

export type NormalizedPlace = {
  provider: 'GEOAPIFY';
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
  openingHours?: { timezone?: string; periods?: Array<{ weekday: number; open: string; close: string }> } | null;
  categoriesRaw?: string[];
};

const GEOAPIFY_BASE = 'https://api.geoapify.com/v2/places';

export async function searchGeoapify(query: PlaceQuery, apiKey?: string): Promise<{ items: NormalizedPlace[]; total?: number; warning?: string }> {
  if (!apiKey) return { items: [], warning: 'Geoapify API key is missing' };

  const url = new URL(GEOAPIFY_BASE);
  url.searchParams.set('apiKey', apiKey);
  const limit = Math.min(50, Math.max(1, query.size ?? 20));
  url.searchParams.set('limit', String(limit));
  if (query.q) url.searchParams.set('text', query.q);

  // Categories mapping from internal slugs
  const geoapifyCats = getGeoapifyCategoriesForPlaceCategories(query.placeCategorySlugs as any);
  if (geoapifyCats.length) url.searchParams.set('categories', geoapifyCats.join(','));

  // Location filter prioritization: rect (bbox) → circle
  if (query.rect) {
    const { minLon, minLat, maxLon, maxLat } = query.rect;
    url.searchParams.set('filter', `rect:${minLon},${minLat},${maxLon},${maxLat}`);
  } else if (query.lat != null && query.lon != null) {
    const radiusM = Math.round((query.radiusKm ?? 5) * 1000);
    url.searchParams.set('filter', `circle:${query.lon},${query.lat},${radiusM}`);
    url.searchParams.set('bias', `proximity:${query.lon},${query.lat}`);
  }
  if (query.openNow) url.searchParams.set('open_now', 'true');

  try {
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!res.ok) return { items: [], warning: `Geoapify HTTP ${res.status}` };
    const data: any = await res.json();
    const features: any[] = data?.features ?? [];
    const items: NormalizedPlace[] = features.map((f: any) => {
      const p = f?.properties || {};
      const id = String(p.place_id ?? p.osm_id ?? `${p.lat},${p.lon}`);
      const title = p.name || p.street || p.address_line1 || 'Place';
      const categoriesRaw: string[] | undefined = Array.isArray(p.categories) ? p.categories.map((c: any) => String(c)) : undefined;
      const address = [p.address_line1, p.address_line2].filter(Boolean).join(', ');
      const loc = (p.lat != null && p.lon != null) ? { lat: Number(p.lat), lon: Number(p.lon) } : undefined;
      // Geoapify does not provide rating consistently; keep nulls
      const imageUrl = p.datasource?.raw?.image || null;
      return {
        provider: 'GEOAPIFY',
        id,
        title,
        description: undefined,
        url: p.website || p.url || undefined,
        imageUrl,
        location: loc,
        address: address || undefined,
        rating: null,
        reviewCount: null,
        openNow: p.open_now ?? undefined,
        openingHours: null,
        categoriesRaw,
      } as NormalizedPlace;
    });
    const total = typeof data?.total === 'number' ? data.total : undefined;
    return { items, total };
  } catch (e: any) {
    return { items: [], warning: `Geoapify error: ${e?.message || 'unknown'}` };
  }
}

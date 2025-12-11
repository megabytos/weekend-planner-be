/*
 PredictHQ Events API provider
 Docs: https://docs.predicthq.com/resources/events-api/
*/

export type EventSearchParams = {
  lat?: number;
  lon?: number;
  radiusKm?: number;
  q?: string;
  fromISO?: string;
  toISO?: string;
  page?: number;
  size?: number;
  categories?: string[]; // PredictHQ category filter
  // Business requirement: support filtering by city IATA codes
  // Format: comma-separated list in the place.scope parameter (e.g., IEV or IEV,LON)
  iataCodes?: string[];
};

// Unified provider event type expected by search.service.ts
export type NormalizedEvent = {
  provider: 'PREDICTHQ';
  id: string;
  title: string;
  description?: string;
  url?: string;
  imageUrl?: string;
  location?: { lat: number; lon: number };
  address?: string;
  occurrences?: Array<{ start: string; end?: string; timezone?: string; url?: string }>;
  // enrichment fields (optional)
  priceFrom?: number | null;
  priceTo?: number | null;
  currency?: string | null;
  isOnline?: boolean | null;
  ageLimit?: number | null;
  rank?: number | null; // PredictHQ rank 0-100
  localRank?: number | null;
  cityName?: string | null;
  countryCode?: string | null;
  venueId?: string | null;
  venueName?: string | null;
  categoriesRaw?: string[];
};

const PHQ_BASE = 'https://api.predicthq.com/v1/events/';

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

export async function searchPredictHQ(params: EventSearchParams, token?: string): Promise<{ items: NormalizedEvent[]; total?: number; warning?: string }> {
  if (!token) {
    return { items: [], warning: 'PredictHQ token is missing' };
  }

  const url = new URL(PHQ_BASE);
  if (params.q) url.searchParams.set('q', params.q);
  if (params.iataCodes && params.iataCodes.length) {
    const codes = Array.from(new Set(params.iataCodes.map((c) => String(c).trim().toUpperCase()).filter(Boolean)));
    if (codes.length) {
      url.searchParams.set('place.scope', codes.join(','));
    }
  }
  if (params.lat !== undefined && params.lon !== undefined) {
    const radius = Math.max(1, Math.min(200, Math.round(params.radiusKm ?? 10)));
    url.searchParams.set('within', `${radius}km@${params.lat},${params.lon}`);
  }
  if (params.fromISO) url.searchParams.set('start.gte', new Date(params.fromISO).toISOString());
  if (params.toISO) url.searchParams.set('start.lte', new Date(params.toISO).toISOString());
  url.searchParams.set('limit', String(Math.min(100, params.size ?? 10)));
  if (params.page && params.page > 1) url.searchParams.set('offset', String((params.page - 1) * (params.size ?? 10)));
  if (params.categories && params.categories.length) {
    const uniq = Array.from(new Set(params.categories.filter(Boolean)));
    if (uniq.length) url.searchParams.set('category', uniq.join(','));
  }

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return { items: [], warning: `PredictHQ HTTP ${res.status}` };
    }
    const data: any = await res.json();
    const events: any[] = data?.results ?? [];
    // Save raw first item for diagnostics
    if (events.length) saveRawSample('PREDICTHQ', events[0]);
    const normalized: NormalizedEvent[] = events.map((ev: any) => {
      const [lon, lat] = Array.isArray(ev.location) ? [ev.location[0], ev.location[1]] : [undefined, undefined];
      // Build occurrence with proper end fallback:
      // If duration === 0 and start === end (or end missing) but predicted_end exists → use predicted_end as end
      let occ: { start: string; end?: string; timezone?: string; url?: string } | undefined;
      if (ev.start) {
        const startStr = String(ev.start);
        let endStr: string | undefined = ev.end ? String(ev.end) : undefined;
        const duration = typeof ev.duration === 'number' ? ev.duration : Number.isFinite(Number(ev.duration)) ? Number(ev.duration) : undefined;
        const predictedEnd = ev.predicted_end ? String(ev.predicted_end) : undefined;
        if ((!endStr || endStr === startStr) && (duration === 0 || duration === undefined) && predictedEnd) {
          // Use predicted_end only if it is a valid ISO and after start
          const sm = Date.parse(startStr);
          const pm = Date.parse(predictedEnd);
          if (!Number.isNaN(sm) && !Number.isNaN(pm) && pm > sm) {
            endStr = predictedEnd;
          }
        }
        occ = { start: startStr, end: endStr, timezone: ev.timezone, url: ev.url };
      }
      const occurrence = occ ? [occ] : undefined;
      const address = ev.entities?.[0]?.name || ev.venue?.name;
      // Try to extract city and countryCode from geo address if provided
      const geoAddr = ev.geo?.address || ev.address || ev.entities?.[0]?.address || ev.venue?.address;
      const cityName = geoAddr?.city?.name || geoAddr?.city || geoAddr?.locality || null;
      const countryCode = geoAddr?.countryCode || geoAddr?.country_code || geoAddr?.country || null;
      const category = ev.category || ev.classification;
      const labels = Array.isArray(ev.labels) ? ev.labels : undefined;
      const rank = ev.rank != null ? Number(ev.rank) : null;
      const localRank = ev.local_rank != null ? Number(ev.local_rank) : null;
      const isOnline = ev.online || ev.is_online || null;
      const venueId = ev.entities?.find((e: any) => e.type === 'venue')?.entity_id || null;
      const venueName = ev.entities?.find((e: any) => e.type === 'venue')?.name || ev.venue?.name || null;
      return {
        provider: 'PREDICTHQ',
        id: String(ev.id),
        title: ev.title || ev.name,
        description: ev.description,
        url: ev.url,
        imageUrl: undefined,
        location: (lat !== undefined && lon !== undefined) ? { lat: Number(lat), lon: Number(lon) } : undefined,
        address,
        occurrences: occurrence,
        priceFrom: null,
        priceTo: null,
        currency: null,
        rank,
        localRank,
        isOnline,
        cityName,
        countryCode,
        venueId,
        venueName,
        categoriesRaw: [category, ...(labels || [])].filter(Boolean) as string[],
      } as NormalizedEvent;
    });
    const total = data?.count ?? normalized.length;
    return { items: normalized, total };
  } catch (e: any) {
    return { items: [], warning: `PredictHQ error: ${e?.message || 'unknown'}` };
  }
}

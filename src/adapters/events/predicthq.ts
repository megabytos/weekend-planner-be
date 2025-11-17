/*
 Minimal PredictHQ Events API adapter
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
};

export type NormalizedEvent = {
  id: string;
  name: string;
  description?: string;
  url?: string;
  imageUrl?: string;
  location?: { lat: number; lon: number };
  address?: string;
  occurrences?: Array<{ start: string; end?: string; timezone?: string; url?: string }>;
  source: { source: 'PREDICTHQ'; externalId: string; url?: string };
};

const PHQ_BASE = 'https://api.predicthq.com/v1/events/';

export async function searchPredictHQ(params: EventSearchParams, token?: string): Promise<{ items: NormalizedEvent[]; total?: number; warning?: string }> {
  if (!token) {
    return { items: [], warning: 'PredictHQ token is missing' };
  }

  const url = new URL(PHQ_BASE);
  if (params.q) url.searchParams.set('q', params.q);
  if (params.lat !== undefined && params.lon !== undefined) {
    const radius = Math.max(1, Math.min(200, Math.round(params.radiusKm ?? 10)));
    url.searchParams.set('within', `${radius}km@${params.lat},${params.lon}`);
  }
  if (params.fromISO) url.searchParams.set('start.gte', new Date(params.fromISO).toISOString());
  if (params.toISO) url.searchParams.set('start.lte', new Date(params.toISO).toISOString());
  url.searchParams.set('limit', String(Math.min(100, params.size ?? 10)));
  if (params.page && params.page > 1) url.searchParams.set('offset', String(((params.page - 1) * (params.size ?? 10))));

  try {
    const res = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      return { items: [], warning: `PredictHQ HTTP ${res.status}` };
    }
    const data: any = await res.json();
    const events: any[] = data?.results ?? [];
    const normalized: NormalizedEvent[] = events.map((ev: any) => {
      const [lon, lat] = Array.isArray(ev.location) ? [ev.location[0], ev.location[1]] : [undefined, undefined];
      const occurrence = ev.start ? [{ start: ev.start, end: ev.end, timezone: ev.timezone, url: ev.url }] : undefined;
      const address = ev.entities?.[0]?.name || ev.venue?.name;
      return {
        id: String(ev.id),
        name: ev.title || ev.name,
        description: ev.description,
        url: ev.url,
        imageUrl: undefined,
        location: (lat !== undefined && lon !== undefined) ? { lat: Number(lat), lon: Number(lon) } : undefined,
        address,
        occurrences: occurrence,
        source: { source: 'PREDICTHQ', externalId: String(ev.id), url: ev.url }
      } as NormalizedEvent;
    });
    const total = data?.count ?? normalized.length;
    return { items: normalized, total };
  } catch (e: any) {
    return { items: [], warning: `PredictHQ error: ${e?.message || 'unknown'}` };
  }
}

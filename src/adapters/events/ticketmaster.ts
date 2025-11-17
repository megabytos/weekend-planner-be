/*
 Minimal Ticketmaster Discovery API adapter
 Docs: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
*/
export type EventSearchParams = {
  lat?: number;
  lon?: number;
  radiusKm?: number;
  q?: string;
  fromISO?: string; // ISO string
  toISO?: string;   // ISO string
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
  source: { source: 'TICKETMASTER'; externalId: string; url?: string };
};

const TM_BASE = 'https://app.ticketmaster.com/discovery/v2/events.json';

export async function searchTicketmaster(params: EventSearchParams, apiKey?: string): Promise<{ items: NormalizedEvent[]; total?: number; warning?: string }> {
  if (!apiKey) {
    return { items: [], warning: 'Ticketmaster API key is missing' };
  }

  const url = new URL(TM_BASE);
  url.searchParams.set('apikey', apiKey);
  if (params.q) url.searchParams.set('keyword', params.q);
  if (params.lat !== undefined && params.lon !== undefined) {
    url.searchParams.set('latlong', `${params.lat},${params.lon}`);
    const radius = Math.max(1, Math.min(100, Math.round(params.radiusKm ?? 10)));
    url.searchParams.set('radius', String(radius));
    url.searchParams.set('unit', 'km');
  }
  if (params.fromISO) url.searchParams.set('startDateTime', new Date(params.fromISO).toISOString().replace(/\.\d{3}Z$/, 'Z'));
  if (params.toISO) url.searchParams.set('endDateTime', new Date(params.toISO).toISOString().replace(/\.\d{3}Z$/, 'Z'));
  url.searchParams.set('size', String(Math.min(100, params.size ?? 20)));
  if (params.page && params.page > 1) url.searchParams.set('page', String(params.page - 1)); // TM uses 0-based pages

  try {
    const res = await fetch(url.toString(), { headers: { 'Accept': 'application/json' } });
    if (!res.ok) {
      return { items: [], warning: `Ticketmaster HTTP ${res.status}` };
    }
    const data: any = await res.json();
    const events: any[] = data?._embedded?.events ?? [];
    const normalized: NormalizedEvent[] = events.map((ev: any) => {
      const imageUrl = (ev.images || []).find((img: any) => img.url)?.url;
      const venue = ev._embedded?.venues?.[0];
      const addrParts = [venue?.address?.line1, venue?.city?.name, venue?.country?.name].filter(Boolean);
      const occurrence = ev.dates?.start ? [{
        start: ev.dates.start.dateTime || ev.dates.start.localDate,
        timezone: ev.dates.timezone,
        url: ev.url
      }] : undefined;
      const lat = venue?.location?.latitude ? Number(venue.location.latitude) : undefined;
      const lon = venue?.location?.longitude ? Number(venue.location.longitude) : undefined;
      return {
        id: ev.id,
        name: ev.name,
        description: ev.info || ev.pleaseNote,
        url: ev.url,
        imageUrl,
        location: lat !== undefined && lon !== undefined ? { lat, lon } : undefined,
        address: addrParts.length ? addrParts.join(', ') : undefined,
        occurrences: occurrence,
        source: { source: 'TICKETMASTER', externalId: ev.id, url: ev.url }
      } as NormalizedEvent;
    });
    const total = data?.page?.totalElements ?? normalized.length;
    return { items: normalized, total };
  } catch (e: any) {
    return { items: [], warning: `Ticketmaster error: ${e?.message || 'unknown'}` };
  }
}

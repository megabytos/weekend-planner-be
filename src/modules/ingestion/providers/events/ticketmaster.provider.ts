/*
 Ticketmaster Discovery API provider
 Docs: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
*/

export type EventSearchParams = {
    lat?: number;
    lon?: number;
    city?: string;
    countryCode?: string;
    radiusKm?: number;
    q?: string;
    fromISO?: string; // ISO string
    toISO?: string; // ISO string
    page?: number;
    size?: number;
    // Taxonomy-driven filters (optional)
    classificationNames?: string[]; // e.g., ['Music', 'Arts & Theatre']
};

// Unified provider event type expected by search.service.ts
export type NormalizedEvent = {
    provider: 'TICKETMASTER';
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
    rank?: number | null;
    localRank?: number | null;
    cityName?: string | null;
    countryCode?: string | null;
    venueId?: string | null;
    venueName?: string | null;
    categoriesRaw?: string[];
};

const TM_BASE = 'https://app.ticketmaster.com/discovery/v2/events.json';

export async function searchTicketmaster(params: EventSearchParams, apiKey?: string): Promise<{ items: NormalizedEvent[]; total?: number; warning?: string }> {
    if (!apiKey) {
        return {items: [], warning: 'Ticketmaster API key is missing'};
    }

    const url = new URL(TM_BASE);
    url.searchParams.set('apikey', apiKey);
    if (params.q) url.searchParams.set('keyword', params.q);
    if (params.city) url.searchParams.set('city', params.city);
    if (params.countryCode) url.searchParams.set('countryCode', params.countryCode);
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
    if (params.classificationNames && params.classificationNames.length) {
        // Ticketmaster supports classificationName as comma-separated list
        const uniq = Array.from(new Set(params.classificationNames.filter(Boolean))).slice(0, 10);
        if (uniq.length) url.searchParams.set('classificationName', uniq.join(','));
    }

    try {
        const res = await fetch(url.toString(), {headers: {Accept: 'application/json'}});
        if (!res.ok) {
            return {items: [], warning: `Ticketmaster HTTP ${res.status}`};
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
                url: ev.url,
            }] : undefined;
            const lat = venue?.location?.latitude ? Number(venue.location.latitude) : undefined;
            const lon = venue?.location?.longitude ? Number(venue.location.longitude) : undefined;
            const priceRange = (ev.priceRanges && ev.priceRanges[0]) || undefined;
            const categoriesRaw = Array.isArray(ev.classifications)
                ? ev.classifications.flatMap((c: any) => [c?.segment?.name, c?.genre?.name, c?.subGenre?.name].map((x: any) => x ? String(x) : ''))
                : undefined;
            const ageLimit = ev.ageRestrictions?.legalAgeEnforced ? 18 : undefined;
            return {
                provider: 'TICKETMASTER',
                id: ev.id,
                title: ev.name,
                description: ev.info || ev.pleaseNote,
                url: ev.url,
                imageUrl,
                location: lat !== undefined && lon !== undefined ? {lat, lon} : undefined,
                address: addrParts.length ? addrParts.join(', ') : undefined,
                occurrences: occurrence,
                priceFrom: priceRange?.min != null ? Number(priceRange.min) : null,
                priceTo: priceRange?.max != null ? Number(priceRange.max) : null,
                currency: priceRange?.currency || null,
                isOnline: false,
                ageLimit: ageLimit ?? null,
                rank: null,
                localRank: null,
                cityName: venue?.city?.name || null,
                countryCode: venue?.country?.countryCode || null,
                venueId: venue?.id || null,
                venueName: venue?.name || null,
                categoriesRaw,
            } as NormalizedEvent;
        });
        const total = data?.page?.totalElements ?? normalized.length;
        return {items: normalized, total};
    } catch (e: any) {
        return {items: [], warning: `Ticketmaster error: ${e?.message || 'unknown'}`};
    }
}

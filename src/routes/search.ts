import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { searchTicketmaster } from '../adapters/events/ticketmaster.js';
import { searchPredictHQ } from '../adapters/events/predicthq.js';

// Zod schemas for the search form — finalized to cover filters/output

// Enums aligned with Prisma schema (kept local for decoupling HTTP from DB)
const PriceTierEnum = z.enum(['FREE', 'CHEAP', 'MODERATE', 'EXPENSIVE', 'ANY']);
const SourceTypeEnum = z.enum(['TICKETMASTER', 'PREDICTHQ', 'GEOAPIFY', 'GOOGLE_PLACES', 'FOURSQUARE', 'MANUAL']);

const BoundingBoxSchema = z.object({
    south: z.number().min(-90).max(90),
    west: z.number().min(-180).max(180),
    north: z.number().min(-90).max(90),
    east: z.number().min(-180).max(180)
}).refine(b => b.north >= b.south && ((b.east - b.west + 360) % 360) >= 0, {
    message: 'Invalid bounding box'
});

export const SearchQuerySchema = z.object({
    // Free text query
    q: z.string().trim().min(1).optional(),

    // Location
    city: z.string().min(1).optional(),
    cityId: z.string().optional(),
    useGeolocation: z.boolean().default(false),
    lat: z.number().min(-90).max(90).optional(),
    lon: z.number().min(-180).max(180).optional(),
    radiusKm: z.number().min(1).max(50).default(10),
    bbox: BoundingBoxSchema.optional(),

    // Time presets and window
    when: z.enum(['now', 'tonight', 'tomorrow', 'this_weekend', 'custom']).default('this_weekend'),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),

    // Company/party format
    party: z.enum(['kids', 'couple', 'solo', 'friends', 'coworkers']).optional(),

    // Duration (desired visit duration window)
    duration: z.enum(['short', 'half_day', 'full_day', 'evening']).optional(),

    // Budget / price tier filters
    budget: z.enum(['free', '$', '$$', '$$$', 'unlimited']).optional(), // legacy UI-friendly
    priceTier: PriceTierEnum.optional(),

    // Mood
    mood: z.enum(['calm', 'active', 'romantic']).optional(),

    // What to search
    kind: z.enum(['places', 'events', 'both']).default('both'),

    // Extra filters
    categories: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    transport: z.enum(['walk', 'public', 'car', 'bike']).optional(),
    kidsAge: z.enum(['0-3', '4-7', '8-12', '13-16']).optional(),
    indoorOutdoor: z.enum(['indoor', 'outdoor', 'any']).optional(),
    openNow: z.boolean().optional(),
    sources: z.array(SourceTypeEnum).optional(),

    // Pagination and sorting
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(20),
    sort: z.enum(['relevance', 'distance', 'time', 'rating']).default('relevance')
});

const CoordinatesSchema = z.object({ lat: z.number(), lon: z.number() });

const SourceRefSchema = z.object({
    source: SourceTypeEnum,
    externalId: z.string(),
    url: z.string().url().optional()
});

const PlaceItemSchema = z.object({
    type: z.literal('place'),
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    mainCategory: z.string().optional(),
    categories: z.array(z.string()).optional(),
    imageUrl: z.string().url().optional(),
    photos: z.array(z.string().url()).optional(),
    location: CoordinatesSchema.optional(),
    address: z.string().optional(),
    distanceKm: z.number().nonnegative().optional(),
    rating: z.number().min(0).max(5).optional(),
    reviewCount: z.number().int().nonnegative().optional(),
    priceTier: PriceTierEnum.optional(),
    priceLevel: z.enum(['$', '$$', '$$$']).optional(), // UI friendly alias
    openNow: z.boolean().optional(),
    venueType: z.enum(['INDOOR', 'OUTDOOR', 'ANY']).optional(),
    url: z.string().url().optional(),
    sources: z.array(SourceRefSchema).optional()
});

const EventOccurrenceSchema = z.object({
    start: z.string(),
    end: z.string().optional(),
    location: CoordinatesSchema.optional(),
    venueId: z.string().optional(),
    timezone: z.string().optional(),
    url: z.string().url().optional()
});

const EventItemSchema = z.object({
    type: z.literal('event'),
    id: z.string(),
    name: z.string(), // title normalized as name for UI consistency
    description: z.string().optional(),
    mainCategory: z.string().optional(),
    categories: z.array(z.string()).optional(),
    imageUrl: z.string().url().optional(),
    photos: z.array(z.string().url()).optional(),
    nextOccurrence: EventOccurrenceSchema.optional(),
    occurrences: z.array(EventOccurrenceSchema).optional(),
    location: CoordinatesSchema.optional(), // fallback if no venue
    address: z.string().optional(),
    distanceKm: z.number().nonnegative().optional(),
    rating: z.number().min(0).max(5).optional(),
    reviewCount: z.number().int().nonnegative().optional(),
    priceTier: PriceTierEnum.optional(),
    priceRange: z.object({ currency: z.string().default('UAH'), min: z.number().optional(), max: z.number().optional() }).optional(),
    ticketsUrl: z.string().url().optional(),
    url: z.string().url().optional(),
    sources: z.array(SourceRefSchema).optional()
});

const FacetBucketSchema = z.object({ key: z.string(), count: z.number().int().nonnegative() });
const FacetsSchema = z.object({
    categories: z.array(FacetBucketSchema).optional(),
    priceTier: z.array(FacetBucketSchema).optional()
}).optional();

const SearchResponseSchema = z.object({
    queryId: z.string(),
    page: z.number(),
    pageSize: z.number(),
    total: z.number().int().nonnegative(),
    tookMs: z.number().int().nonnegative().optional(),
    warnings: z.array(z.string()).optional(),
    bbox: BoundingBoxSchema.optional(),
    facets: FacetsSchema,
    items: z.array(z.union([PlaceItemSchema, EventItemSchema]))
});

export default async function searchRoutes(app: FastifyInstance) {
    app.post('/', {
        schema: {
            description: 'Unified search for places and events. Events are fetched from Ticketmaster and PredictHQ when configured.',
            tags: ['search'],
            body: SearchQuerySchema,
            response: { 200: SearchResponseSchema }
        }
    }, async (req, reply) => {
        const started = Date.now();
        const query = req.body as z.infer<typeof SearchQuerySchema>;

        const warnings: string[] = [];

        // Resolve time window
        const now = new Date();
        let fromISO = query.from;
        let toISO = query.to;
        if (query.when !== 'custom') {
            const start = new Date(now);
            const end = new Date(now);
            switch (query.when) {
                case 'now':
                    // next 6 hours
                    end.setHours(end.getHours() + 6);
                    break;
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
        }

        // Determine which sources to query for events
        const requestedSources = new Set((query.sources && query.sources.length ? query.sources : ['TICKETMASTER', 'PREDICTHQ']) as typeof SourceTypeEnum._type[]);

        const shouldQueryEvents = query.kind === 'events' || query.kind === 'both';

        type EventOut = z.infer<typeof EventItemSchema>;
        let events: EventOut[] = [];

        if (shouldQueryEvents) {
            const lat = query.lat;
            const lon = query.lon;
            const radiusKm = query.radiusKm ?? 10;
            if (lat === undefined || lon === undefined) {
                warnings.push('Location (lat/lon) is recommended for event search.');
            }

            const size = query.pageSize;
            const page = query.page;

            const tasks: Promise<void>[] = [];
            if (requestedSources.has('TICKETMASTER')) {
                tasks.push((async () => {
                    const { items, warning } = await searchTicketmaster({ lat, lon, radiusKm, q: query.q, fromISO, toISO, page, size }, process.env.TICKETMASTER_API_KEY);
                    if (warning) warnings.push(warning);
                    events.push(...items.map<EventOut>(ev => ({
                        type: 'event',
                        id: `ticketmaster:${ev.id}`,
                        name: ev.name,
                        description: ev.description,
                        imageUrl: ev.imageUrl,
                        location: ev.location,
                        address: ev.address,
                        occurrences: ev.occurrences?.map(o => ({ start: o.start, end: o.end, timezone: o.timezone, url: o.url })),
                        nextOccurrence: ev.occurrences?.[0] ? { start: ev.occurrences[0].start, end: ev.occurrences[0].end, timezone: ev.occurrences[0].timezone, url: ev.occurrences[0].url } : undefined,
                        url: ev.url,
                        sources: [{ source: 'TICKETMASTER', externalId: ev.id, url: ev.url }]
                    })));
                })());
            }
            if (requestedSources.has('PREDICTHQ')) {
                tasks.push((async () => {
                    const { items, warning } = await searchPredictHQ({ lat, lon, radiusKm, q: query.q, fromISO, toISO, page, size }, process.env.PREDICTHQ_TOKEN);
                    if (warning) warnings.push(warning);
                    events.push(...items.map<EventOut>(ev => ({
                        type: 'event',
                        id: `predicthq:${ev.id}`,
                        name: ev.name,
                        description: ev.description,
                        imageUrl: ev.imageUrl,
                        location: ev.location,
                        address: ev.address,
                        occurrences: ev.occurrences?.map(o => ({ start: o.start, end: o.end, timezone: o.timezone, url: o.url })),
                        nextOccurrence: ev.occurrences?.[0] ? { start: ev.occurrences[0].start, end: ev.occurrences[0].end, timezone: ev.occurrences[0].timezone, url: ev.occurrences[0].url } : undefined,
                        url: ev.url,
                        sources: [{ source: 'PREDICTHQ', externalId: ev.id, url: ev.url }]
                    })));
                })());
            }

            await Promise.all(tasks);
        }

        // For now, places are not integrated; return only events.
        // Basic pagination over merged results (client requested page & pageSize)
        const total = events.length;
        const startIdx = ((query.page || 1) - 1) * (query.pageSize || 20);
        const pagedItems = events.slice(startIdx, startIdx + (query.pageSize || 20));

        return {
            queryId: `${Date.now()}`,
            page: query.page || 1,
            pageSize: query.pageSize || 20,
            total,
            tookMs: Date.now() - started,
            warnings: warnings.length ? warnings : undefined,
            items: pagedItems
        };
    });
}

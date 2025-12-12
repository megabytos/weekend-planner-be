import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { TAXONOMY_CATEGORIES } from '../catalog/taxonomy/taxonomy.constants.js';
import { GEO_CITIES } from '../geo/geo.constants.js';
import { CACHE_NAMESPACE_VERSION } from '../../config/cache.js';

const PingResponseSchema = z.object({
    pong: z.string(),
});

export default async function systemRoutes(app: FastifyInstance) {
    app.get(
        '/ping',
        {
            schema: {
                description: 'Simple ping endpoint',
                tags: ['system'],
                response: { 200: PingResponseSchema },
            },
        },
        async () => ({ pong: 'it works' } as const),
    );

    // Endpoint to clear ONLY ingest-created data (places/events and their sources/relations)
    // Usage: POST /api/system/ingest/clear?clear_ingest=1
    const ClearIngestResponse = z.object({
        ok: z.boolean(),
        details: z.object({
            deleted: z.object({
                eventOccurrences: z.number(),
                placeSources: z.number(),
                eventSources: z.number(),
                placeToCategory: z.number(),
                eventToCategory: z.number(),
                places: z.number(),
                events: z.number(),
            }),
        }),
    });

    app.post(
        '/ingest/clear',
        {
            schema: {
                description: 'Clears all data written by online ingest (canonical Places/Events with external providers and their relations). Requires query param clear_ingest=1.',
                tags: ['system'],
                querystring: z.object({ clear_ingest: z.string().optional() }),
                response: { 200: ClearIngestResponse },
            },
        },
        async (req, reply) => {
            const q = req.query as { clear_ingest?: string };
            if (q.clear_ingest !== '1') {
                // Keep 200 response to satisfy route schema typing; indicate no-op
                return { ok: false, details: { deleted: { eventOccurrences: 0, placeSources: 0, eventSources: 0, placeToCategory: 0, eventToCategory: 0, places: 0, events: 0 } } } as const;
            }

            // External providers we consider "ingest-managed"
            const externalProviders = ['TICKETMASTER', 'PREDICTHQ', 'GEOAPIFY', 'GOOGLE_PLACES', 'FOURSQUARE'] as const;

            const prisma = app.prisma;

            const result = await prisma.$transaction(async (tx) => {
                // Collect IDs to delete (only entities created/owned by external ingest)
                const placeIds = (
                    await tx.place.findMany({
                        where: { provider: { in: externalProviders as any } },
                        select: { id: true },
                    })
                ).map((p) => p.id);

                const eventIds = (
                    await tx.event.findMany({
                        where: { provider: { in: externalProviders as any } },
                        select: { id: true },
                    })
                ).map((e) => e.id);

                // Delete child rows first to respect FK relations
                const delEventOccurrences = await tx.eventOccurrence.deleteMany({ where: { eventId: { in: eventIds } } });
                const delPlaceSources = await tx.placeSource.deleteMany({ where: { placeId: { in: placeIds } } });
                const delEventSources = await tx.eventSource.deleteMany({ where: { eventId: { in: eventIds } } });
                const delPlaceToCategory = await tx.placeToCategory.deleteMany({ where: { placeId: { in: placeIds } } });
                const delEventToCategory = await tx.eventToCategory.deleteMany({ where: { eventId: { in: eventIds } } });

                // Delete canonical entities
                const delPlaces = await tx.place.deleteMany({ where: { id: { in: placeIds } } });
                const delEvents = await tx.event.deleteMany({ where: { id: { in: eventIds } } });

                return {
                    deleted: {
                        eventOccurrences: delEventOccurrences.count,
                        placeSources: delPlaceSources.count,
                        eventSources: delEventSources.count,
                        placeToCategory: delPlaceToCategory.count,
                        eventToCategory: delEventToCategory.count,
                        places: delPlaces.count,
                        events: delEvents.count,
                    },
                };
            });

            return { ok: true, details: result } as const;
        },
    );

    // Endpoint to seed taxonomy and geo (similar to `npm run seed:all`), with safe cleanup of taxonomy relations
    // Usage: POST /api/system/seed/all?seed_all=1
    const SeedAllResponse = z.object({
        ok: z.boolean(),
        details: z.object({
            taxonomy: z.object({ created: z.number(), updated: z.number(), clearedRelations: z.boolean() }),
            geo: z.object({ upserted: z.number() }),
        }),
    });

    app.post(
        '/seed/all',
        {
            schema: {
                description:
                    'Seeds taxonomy (place/event categories) and geo cities similar to npm run seed:all. Clears taxonomy relations safely before reseed. Requires query param seed_all=1.',
                tags: ['system'],
                querystring: z.object({ seed_all: z.string().optional() }),
                response: { 200: SeedAllResponse },
            },
        },
        async (req) => {
            const q = req.query as { seed_all?: string };
            if (q.seed_all !== '1') {
                return { ok: false, details: { taxonomy: { created: 0, updated: 0, clearedRelations: false }, geo: { upserted: 0 } } } as const;
            }

            const prisma = app.prisma;
            const result = await prisma.$transaction(async (tx) => {
                // 1) Safely clear taxonomy relations (does NOT delete places/events)
                await tx.placeToCategory.deleteMany({});
                await tx.eventToCategory.deleteMany({});
                await tx.place.updateMany({ data: { mainCategoryId: null } });
                await tx.event.updateMany({ data: { mainCategoryId: null } });
                await tx.placeCategory.deleteMany({});
                await tx.eventCategory.deleteMany({});

                // 2) Seed taxonomy categories from TAXONOMY_CATEGORIES
                let created = 0;
                let updated = 0;
                for (const c of TAXONOMY_CATEGORIES) {
                    const data: any = { key: c.slug, title: c.name, expectedDuration: (c as any).expected_duration ?? null };
                    if (c.type === 'PLACE') {
                        const exists = await tx.placeCategory.findUnique({ where: { key: c.slug } });
                        if (exists) {
                            await tx.placeCategory.update({ where: { key: c.slug }, data });
                            updated++;
                        } else {
                            await tx.placeCategory.create({ data });
                            created++;
                        }
                    } else if (c.type === 'EVENT') {
                        const exists = await tx.eventCategory.findUnique({ where: { key: c.slug } });
                        if (exists) {
                            await tx.eventCategory.update({ where: { key: c.slug }, data });
                            updated++;
                        } else {
                            await tx.eventCategory.create({ data });
                            created++;
                        }
                    }
                }

                // 3) Seed geo cities (upsert by id)
                let upserted = 0;
                for (const c of GEO_CITIES) {
                    await tx.city.upsert({
                        where: { id: String(c.id) },
                        update: {
                            name: c.name,
                            country: c.countryName,
                            countryCode: c.countryCode,
                            codeIATA: c.codeIATA ?? null,
                            lat: c.coordinates.lat,
                            lng: c.coordinates.lon,
                            minLat: c.boundingBox?.minLat ?? null,
                            minLng: c.boundingBox?.minLon ?? null,
                            maxLat: c.boundingBox?.maxLat ?? null,
                            maxLng: c.boundingBox?.maxLon ?? null,
                        },
                        create: {
                            id: String(c.id),
                            name: c.name,
                            country: c.countryName,
                            countryCode: c.countryCode,
                            codeIATA: c.codeIATA ?? null,
                            lat: c.coordinates.lat,
                            lng: c.coordinates.lon,
                            minLat: c.boundingBox?.minLat ?? null,
                            minLng: c.boundingBox?.minLon ?? null,
                            maxLat: c.boundingBox?.maxLat ?? null,
                            maxLng: c.boundingBox?.maxLon ?? null,
                            tz: 'UTC',
                        },
                    });
                    upserted++;
                }

                return { taxonomy: { created, updated, clearedRelations: true }, geo: { upserted } };
            });

            return { ok: true, details: result } as const;
        },
    );

    // Endpoint to clear entire cache namespace (safe, only our keys)
    // Usage: POST /api/system/cache/clear?clear_cache=1
    const ClearCacheResponse = z.object({ ok: z.boolean(), deleted: z.number().optional(), message: z.string().optional() });
    app.post(
        '/cache/clear',
        {
            schema: {
                description: 'Clears all Redis cache keys for current namespace (CACHE_NS_VERSION). Requires clear_cache=1.',
                tags: ['system'],
                querystring: z.object({ clear_cache: z.string().optional() }),
                response: { 200: ClearCacheResponse },
            },
        },
        async (req) => {
            const q = req.query as { clear_cache?: string };
            if (q.clear_cache !== '1') {
                return { ok: false, message: 'Pass clear_cache=1 to confirm cache clearing' } as const;
            }
            const redis = (app as any).redis as import('ioredis').Redis | undefined;
            if (!redis) {
                return { ok: false, message: 'Redis is not configured' } as const;
            }
            const pattern = `${CACHE_NAMESPACE_VERSION}:*`;
            let cursor = '0';
            let totalDeleted = 0;
            do {
                const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 5000);
                cursor = next;
                if (keys && keys.length) {
                    // Also delete freshness markers for SWR (key:fresh) by generating their names
                    const freshKeys = keys.map((k) => `${k}:fresh`);
                    const delCount = await redis.del(...keys, ...freshKeys).catch(() => 0);
                    totalDeleted += Number(delCount);
                }
            } while (cursor !== '0');
            return { ok: true, deleted: totalDeleted } as const;
        }
    );
}

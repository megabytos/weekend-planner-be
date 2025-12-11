import { FastifyInstance } from 'fastify';
import { z } from 'zod';

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
}

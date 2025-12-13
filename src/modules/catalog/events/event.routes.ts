import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listEvents, EventService } from './event.service.js';
import { EventIdParamSchema, EventListResponseSchema, EventSchema } from './event.schemas.js';
import { searchUnifiedFromDb } from '../../search/search.service.js';
import { searchResponseSchema } from '../../search/search.schemas.js';
import { CacheService } from '../../cache/cache.service.js';
import { CACHE_TTL_CATALOG_EVENTS } from '../../../config/cache.js';

export default async function eventRoutes(app: FastifyInstance) {
    const service = new EventService(app.prisma);
  app.get('/', {
    schema: {
      description: 'Lists events (placeholder)',
      tags: ['catalog.events'],
      response: { 200: EventListResponseSchema }
    }
  }, async () => {
    return listEvents();
  });

  app.get('/:id', {
    schema: {
      description: 'Returns event by id (placeholder)',
      tags: ['catalog.events'],
      params: EventIdParamSchema,
      response: { 200: EventSchema.nullable() }
    }
  }, async (req) => {
    const params = req.params as z.infer<typeof EventIdParamSchema>;
    const event = await service.getEventById(params.id);
    return event; // null when not found in placeholder
  });

    app.post(
        '/', {
            schema: {
                description: 'Add event (placeholder)',
                tags: ['catalog.events'],
                body: EventSchema
            }
        },
        async (req, reply) => {
            // This endpoint will be used both by partner portal and admin
            const place = await service.createEvent(req.body as any);
            reply.code(201);
            return place;
        }
    );

    // Popular events by city (DB-only search format, next month)
    const PopularParamsSchema = z.object({ cityId: z.string() });
    app.get('/popular/:cityId', {
        schema: {
            description: 'Popular events in the specified city)',
            tags: ['catalog.events'],
            params: PopularParamsSchema,
            response: { 200: searchResponseSchema }
        }
    }, async (req) => {
        const params = PopularParamsSchema.parse(req.params);
        const cache = new CacheService(app);
        const key = cache.buildKey('catalog:events:popular', { cityId: params.cityId, days: 30, limit: 12, offset: 0 });
        if (cache.isEnabled()) {
            const cached = await cache.getJSON<any>(key);
            if (cached) return cached;
        }

        const now = new Date();
        const to = new Date(now);
        to.setDate(to.getDate() + 30);
        const query: any = {
            where: { city: { id: params.cityId as any } },
            when: { type: 'range', from: now.toISOString(), to: to.toISOString() },
            target: 'events',
            sort: 'rank',
            pagination: { limit: 12, offset: 0, page: 1 }
        };
        const resp = await searchUnifiedFromDb(query as any, app.prisma);
        if (cache.isEnabled()) {
            const tags = [`city:${params.cityId}:catalog:events`];
            try { await cache.setJSON(key, resp, { ttlSeconds: CACHE_TTL_CATALOG_EVENTS, tags }); } catch {}
        }
        return resp;
    });

}

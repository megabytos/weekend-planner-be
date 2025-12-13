import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listPlaces, PlaceService } from './place.service.js';
import { PlaceIdParamSchema, PlaceListResponseSchema, PlaceSchema } from './place.schemas.js';
import { searchUnifiedFromDb } from '../../search/search.service.js';
import { searchResponseSchema } from '../../search/search.schemas.js';
import { CacheService } from '../../cache/cache.service.js';
import { CACHE_TTL_CATALOG_PLACES } from '../../../config/cache.js';


export default async function placeRoutes(app: FastifyInstance) {
    const service = new PlaceService(app.prisma);

    app.get('/', {
        schema: {
            description: 'Lists places (placeholder)',
            tags: ['catalog.places'],
            response: {200: PlaceListResponseSchema}
        }
    }, async () => {
        return listPlaces();
    });

    app.get('/:id', {
        schema: {
            description: 'Returns place by id (placeholder)',
            tags: ['catalog.places'],
            params: PlaceIdParamSchema,
            response: {200: PlaceSchema.nullable()}
        }
    }, async (req) => {
        const params = req.params as z.infer<typeof PlaceIdParamSchema>;
        const place = await service.getPlaceById(params.id);
        return place; // null when not found in placeholder
    });

    app.post(
        '/', {
            schema: {
                description: 'Add place (placeholder)',
                tags: ['catalog.places'],
                body: PlaceSchema
            }
        },
        async (req, reply) => {
            // This endpoint will be used both by partner portal and admin
            const place = await service.createPlace(req.body as any);
            reply.code(201);
            return place;
        }
    );

    // Popular places by city (DB-only search format)
    const PopularParamsSchema = z.object({ cityId: z.string() });
    app.get('/popular/:cityId', {
        schema: {
            description: 'Popular places in the specified city (DB only, same response as /api/search)',
            tags: ['catalog.places'],
            params: PopularParamsSchema,
            response: { 200: searchResponseSchema }
        }
    }, async (req) => {
        const params = PopularParamsSchema.parse(req.params);
        const cache = new CacheService(app);
        const key = cache.buildKey('catalog:places:popular', { cityId: params.cityId, limit: 12, offset: 0 });
        if (cache.isEnabled()) {
            const cached = await cache.getJSON<any>(key);
            if (cached) return cached;
        }
        // Build minimal SearchRequest-like object for places
        const query: any = {
            where: { city: { id: params.cityId as any } },
            target: 'places',
            sort: 'rank',
            pagination: { limit: 12, offset: 0, page: 1 }
        };
        const resp = await searchUnifiedFromDb(query as any, app.prisma);
        if (cache.isEnabled()) {
            const tags = [`city:${params.cityId}:catalog:places`];
            try { await cache.setJSON(key, resp, { ttlSeconds: CACHE_TTL_CATALOG_PLACES, tags }); } catch {}
        }
        return resp;
    });

}

import {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {listPlaces, PlaceService} from './place.service.js';
import {PlaceIdParamSchema, PlaceListResponseSchema, PlaceSchema} from './place.schemas.js';


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

}

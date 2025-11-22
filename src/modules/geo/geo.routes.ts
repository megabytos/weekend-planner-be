import type { FastifyPluginAsync } from 'fastify';
import { GeoService } from './geo.service.js';
import {
    geoCitiesQuerySchema,
    geoCitiesResponseSchema,
    geoCityParamsSchema,
    geoCitySchema
} from './geo.schemas.js';

export const geoRoutes: FastifyPluginAsync = async (app) => {
    const service = new GeoService();
    app.get(
        '/cities',
        {
            schema: {
                description: 'Lists available cities for geo features',
                tags: ['geo'],
                querystring: geoCitiesQuerySchema,
                response: {
                    200: geoCitiesResponseSchema
                }
            }
        },
        async (request) => {
            const startedAt = Date.now();
            const query = geoCitiesQuerySchema.parse(request.query);
            const items = service.listCities({
                q: query.q,
                countryCode: query.countryCode
            });

            const tookMs = Date.now() - startedAt;
            const response = {
                queryId: `${startedAt}`,
                total: items.length,
                tookMs,
                warnings: [] as string[],
                items,
            };
            return geoCitiesResponseSchema.parse(response);
        }
    );
    app.get(
        '/cities/:id',
        {
            schema: {
                description: 'Returns city by id',
                tags: ['geo'],
                params: geoCityParamsSchema,
                response: {
                    200: geoCitySchema
                }
            }
        },
        async (request, reply) => {
            const params = geoCityParamsSchema.parse(request.params);
            const city = service.getCityById(params.id);

            if (!city) {
                //return reply.code(404).send({ message: 'City not found' });
            }

            return geoCitySchema.parse(city);
        }
    );
};

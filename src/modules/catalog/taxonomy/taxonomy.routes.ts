import type { FastifyPluginAsync } from 'fastify';
import { TaxonomyService } from './taxonomy.service.js';
import {
    taxonomyCategoriesQuerySchema,
    taxonomyCategoriesResponseSchema
} from './taxonomy.schemas.js';

export const taxonomyRoutes: FastifyPluginAsync = async (app) => {
    const service = new TaxonomyService();

    app.get(
        '/',
        {
            schema: {
                description: 'Lists taxonomy categories (placeholder)',
                tags: ['catalog.taxonomy'],
                querystring: taxonomyCategoriesQuerySchema,
                response: {
                    200: taxonomyCategoriesResponseSchema
                }
            }
        },
        async (request) => {
            const query = taxonomyCategoriesQuerySchema.parse(request.query);
            const items = query.type
                ? service.listCategories({ type: query.type })
                : service.listCategories();
            return taxonomyCategoriesResponseSchema.parse({ items });
        }
    );
};

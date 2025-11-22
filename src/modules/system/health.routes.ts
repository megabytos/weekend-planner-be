import {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ZodTypeProvider} from 'fastify-type-provider-zod';
import {config} from '../../config/env.js';

// Health and version endpoints (root-level)
export default async function healthRoutes(app: FastifyInstance) {
    const zodApp = app.withTypeProvider<ZodTypeProvider>();
    zodApp.get(
        '/health',
        {
            schema: {
                description: 'Health check endpoint',
                tags: ['system'],
                response: {
                    200: z.object({status: z.string(), uptime: z.number(), env: z.string()}),
                },
            },
        },
        async () => ({status: 'ok', uptime: process.uptime(), env: config.NODE_ENV})
    );

    zodApp.get(
        '/version',
        {
            schema: {
                description: 'Returns service version',
                tags: ['system'],
                response: {200: z.object({version: z.string()})},
            },
        },
        async () => ({version: config.SWAGGER_VERSION})
    );
}

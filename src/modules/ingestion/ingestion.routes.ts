import { FastifyInstance } from 'fastify';
import { z } from 'zod';

const IngestionRunResponseSchema  = z.object({
    accepted: z.boolean(),
});

export default async function ingestionRoutes(app: FastifyInstance) {
    app.post('/run',  {
            schema: {
                description: 'Triggers ingestion batch job (placeholder)',
                tags: ['ingestion'],
                response: {
                    202: IngestionRunResponseSchema,
                },
            },
        },
        async () => ({ accepted: true }),
    );
}

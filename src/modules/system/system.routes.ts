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
}

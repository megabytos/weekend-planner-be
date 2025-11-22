import { FastifyInstance } from 'fastify';
import { z } from 'zod';

export default async function reviewsRoutes(app: FastifyInstance) {
  app.get('/', {
    schema: {
      description: 'Reviews module placeholder',
      tags: ['reviews'],
      response: { 200: z.object({ status: z.literal('ok') }) }
    }
  }, async () => ({ status: 'ok' as const }));
}

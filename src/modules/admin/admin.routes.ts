import { FastifyInstance } from 'fastify';
import { z } from 'zod';

export default async function adminRoutes(app: FastifyInstance) {
  app.get('/', {
    schema: {
      description: 'Admin module placeholder',
      tags: ['admin'],
      response: { 200: z.object({ status: z.literal('ok') }) }
    }
  }, async () => ({ status: 'ok' as const }));
}

import { FastifyInstance } from 'fastify';
import { z } from 'zod';

export default async function groupsRoutes(app: FastifyInstance) {
  app.get('/', {
    schema: {
      description: 'Groups module placeholder',
      tags: ['groups'],
      response: { 200: z.object({ status: z.literal('ok') }) }
    }
  }, async () => ({ status: 'ok' as const }));
}

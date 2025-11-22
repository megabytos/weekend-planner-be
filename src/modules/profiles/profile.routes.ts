import { FastifyInstance } from 'fastify';
import { z } from 'zod';

export default async function profileRoutes(app: FastifyInstance) {
  app.get('/', {
    schema: {
      description: 'Profiles module placeholder',
      tags: ['profiles'],
      response: { 200: z.object({ status: z.literal('ok') }) }
    }
  }, async () => ({ status: 'ok' as const }));
}

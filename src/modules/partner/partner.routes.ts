import { FastifyInstance } from 'fastify';
import { z } from 'zod';

export default async function partnerRoutes(app: FastifyInstance) {
  app.get('/', {
    schema: {
      description: 'Partner module placeholder',
      tags: ['partner'],
      response: { 200: z.object({ status: z.literal('ok') }) }
    }
  }, async () => ({ status: 'ok' as const }));
}

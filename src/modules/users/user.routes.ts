import { FastifyInstance } from 'fastify';
import { z } from 'zod';

export default async function userRoutes(app: FastifyInstance) {
  app.get('/', {
    schema: {
      description: 'Users module placeholder',
      tags: ['users'],
      response: { 200: z.object({ status: z.literal('ok') }) }
    }
  }, async () => ({ status: 'ok' as const }));
}

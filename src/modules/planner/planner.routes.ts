import { FastifyInstance } from 'fastify';
import { z } from 'zod';

export default async function plannerRoutes(app: FastifyInstance) {
  app.get('/', {
    schema: {
      description: 'Planner module placeholder',
      tags: ['planner'],
      response: { 200: z.object({ status: z.literal('ok') }) }
    }
  }, async () => ({ status: 'ok' as const }));
}

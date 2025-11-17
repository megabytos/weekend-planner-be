import { FastifyInstance } from 'fastify';

export default async function systemRoutes(app: FastifyInstance) {
  app.get('/ping', {
    schema: {
      description: 'Simple ping endpoint',
      tags: ['system'],
      response: {
        200: { type: 'object', properties: { pong: { type: 'string' } } }
      }
    }
  }, async () => ({ pong: 'it works' }));
}

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listEvents, EventService } from './event.service.js';
import { EventIdParamSchema, EventListResponseSchema, EventSchema } from './event.schemas.js';

export default async function eventRoutes(app: FastifyInstance) {
    const service = new EventService(app.prisma);
  app.get('/', {
    schema: {
      description: 'Lists events (placeholder)',
      tags: ['catalog.events'],
      response: { 200: EventListResponseSchema }
    }
  }, async () => {
    return listEvents();
  });

  app.get('/:id', {
    schema: {
      description: 'Returns event by id (placeholder)',
      tags: ['catalog.events'],
      params: EventIdParamSchema,
      response: { 200: EventSchema.nullable() }
    }
  }, async (req) => {
    const params = req.params as z.infer<typeof EventIdParamSchema>;
    const event = await service.getEventById(params.id);
    return event; // null when not found in placeholder
  });

    app.post(
        '/', {
            schema: {
                description: 'Add event (placeholder)',
                tags: ['catalog.events'],
                body: EventSchema
            }
        },
        async (req, reply) => {
            // This endpoint will be used both by partner portal and admin
            const place = await service.createEvent(req.body as any);
            reply.code(201);
            return place;
        }
    );

}

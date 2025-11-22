import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { searchRequestSchema, searchResponseSchema, type SearchRequest } from './search.schemas.js';
import { searchUnified } from './search.service.js';

// Search routes under /api/search using Zod schemas and service layer
export default async function searchRoutes(app: FastifyInstance) {
  app.post(
    '/',
    {
      schema: {
        description:
          'Unified search for places and events. Events: Ticketmaster & PredictHQ; Places: Geoapify, Google Places, Foursquare (when API keys are configured).',
        tags: ['search'],
        body: searchRequestSchema,
        response: { 200: searchResponseSchema },
      },
    },
    async (req) => {
      const query = req.body as z.infer<typeof searchRequestSchema> as SearchRequest;
      // Use validated config exposed on app instance
      const { TICKETMASTER_API_KEY, PREDICTHQ_TOKEN, GEOAPIFY_API_KEY, GOOGLE_PLACES_API_KEY, FOURSQUARE_API_KEY } = app.config;
      return await searchUnified(query, {
        ticketmasterApiKey: TICKETMASTER_API_KEY,
        predicthqToken: PREDICTHQ_TOKEN,
        geoapifyApiKey: GEOAPIFY_API_KEY,
        googlePlacesApiKey: GOOGLE_PLACES_API_KEY,
        foursquareApiKey: FOURSQUARE_API_KEY,
      });
    }
  );
}

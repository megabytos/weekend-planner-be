import { FastifyInstance } from 'fastify';
import systemRoutes from './system.js';
import searchRoutes from './search.js';
import authRoutes from './auth.js';

export default async function registerRoutes(app: FastifyInstance) {
  await app.register(systemRoutes, { prefix: '/api/system' });
  await app.register(searchRoutes, { prefix: '/api/search' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  // Placeholders for other modules; we will add them incrementally.
}

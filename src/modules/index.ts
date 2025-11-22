import { FastifyInstance } from 'fastify';
import healthRoutes from './system/health.routes.js';
import systemRoutes from './system/system.routes.js';
import searchRoutes from './search/search.routes.js';
import ingestionRoutes from './ingestion/ingestion.routes.js';
import placesRoutes from './catalog/places/place.routes.js';
import eventsRoutes from './catalog/events/event.routes.js';
import {taxonomyRoutes} from './catalog/taxonomy/taxonomy.routes.js';

import plannerRoutes from './planner/planner.routes.js';
import profilesRoutes from './profiles/profile.routes.js';
import partnerRoutes from './partner/partner.routes.js';
import adminRoutes from './admin/admin.routes.js';
import notificationsRoutes from './notifications/notifications.routes.js';
import usersRoutes from './users/user.routes.js';
import groupsRoutes from './groups/groups.routes.js';
import reviewsRoutes from './reviews/reviews.routes.js';
import authRoutes from './auth/auth.routes.js';
import { geoRoutes } from './geo/geo.routes.js';

// Registers all domain modules and their route prefixes
export default async function registerModules(app: FastifyInstance) {
  await app.register(healthRoutes);
  await app.register(systemRoutes, { prefix: '/api/system' });
  await app.register(searchRoutes, { prefix: '/api/search' });
  await app.register(ingestionRoutes, { prefix: '/api/ingestion' });
    await app.register(placesRoutes, { prefix: '/api/places' });
    await app.register(eventsRoutes, { prefix: '/api/events' });
    await app.register(taxonomyRoutes, { prefix: '/api/taxonomy' });
  await app.register(plannerRoutes, { prefix: '/api/planner' });

    // Protected cabinets by role (encapsulated with onRequest hook)
  await app.register(async (scope) => {
    scope.addHook('onRequest', app.authorize(['USER', 'PARTNER', 'ADMIN']));
    await scope.register(profilesRoutes);
  }, { prefix: '/api/profiles' });

  await app.register(async (scope) => {
    scope.addHook('onRequest', app.authorize(['PARTNER', 'ADMIN']));
    await scope.register(partnerRoutes);
  }, { prefix: '/api/partner' });

  await app.register(async (scope) => {
    scope.addHook('onRequest', app.authorize(['ADMIN']));
    await scope.register(adminRoutes);
  }, { prefix: '/api/admin' });

  await app.register(notificationsRoutes, { prefix: '/api/notifications' });
  // Users common module: allow any authenticated role
  await app.register(async (scope) => {
    scope.addHook('onRequest', app.authorize(['USER', 'PARTNER', 'ADMIN']));
    await scope.register(usersRoutes);
  }, { prefix: '/api/users' });
  await app.register(groupsRoutes, { prefix: '/api/groups' });
  await app.register(reviewsRoutes, { prefix: '/api/reviews' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(geoRoutes, { prefix: '/api/geo' });
}

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUI  from '@fastify/swagger-ui';
import {
  ZodTypeProvider,
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';

import prismaPlugin from './plugins/prisma.js';
import redisPlugin from './plugins/redis.js';
import authPlugin from './plugins/auth.js';
import logger from './plugins/logger.js';
import registerModules from './modules/index.js';
import { config } from './config/env.js';

// Factory that creates and configures Fastify instance (app-level setup)
export async function createApp() {
  const app = Fastify({
      loggerInstance: logger,
      trustProxy: true
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  // Expose validated configuration on app instance for typed access in routes/services
  // Note: typings provided in src/types/fastify.d.ts
  app.decorate('config', config);


  const allowedOrigins = new Set([
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://weekend-planner-fe.vercel.app',
    'https://weekend-planner-be.onrender.com',
  ]);
  
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.has(origin)) return cb(null, origin);
      return cb(new Error('Origin not allowed by CORS'), false);
    },
    credentials: true,
  });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: config.SWAGGER_TITLE,
        version: config.SWAGGER_VERSION,
        description: 'Backend API for WeekendPlanner. This OpenAPI document is generated from Zod schemas and Fastify route metadata.',
        contact: {
          name: 'WeekendPlanner Backend',
          url: 'https://github.com/your-org/weekend-planner-be',
        },
        license: {
          name: 'MIT License',
          url: 'https://opensource.org/licenses/MIT',
        },
      },
      servers: [
        { url: '/', description: 'Current host' },
      ],
      tags: [
        { name: 'system', description: 'Health and service info' },
        { name: 'search', description: 'Unified search across external providers' },
        { name: 'auth', description: 'Authentication and authorization' },
        { name: 'users', description: 'User accounts' },
        { name: 'profiles', description: 'User profiles' },
        { name: 'catalog.places', description: 'Places catalog' },
        { name: 'catalog.events', description: 'Events catalog' },
        { name: 'catalog.taxonomy', description: 'Taxonomy and categories' },
        { name: 'geo', description: 'Geospatial helpers and lookups' },
        { name: 'planner', description: 'Planning, schedules, and itineraries' },
        { name: 'groups', description: 'Groups and collaboration' },
        { name: 'reviews', description: 'Reviews and ratings' },
        { name: 'notifications', description: 'Notifications and subscriptions' },
        { name: 'partner', description: 'Partner-facing endpoints' },
        { name: 'ingestion', description: 'Data ingestion and imports' },
      ],
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      security: [{ BearerAuth: [] }],
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  });
  await app.register(fastifySwaggerUI, {
      routePrefix: '/docs',
      uiConfig: {
          docExpansion: 'list',
          // Explicitly point Swagger UI to the JSON spec route that @fastify/swagger exposes
          // By default, swagger-ui at /docs tries to fetch /docs/json which does not exist
          // The actual JSON is served at /documentation/json
          url: '/documentation/json'
      }
  });

  await app.register(prismaPlugin);
  await app.register(redisPlugin);
  await app.register(authPlugin);



  // Register all domain modules (routes)
  await app.register(registerModules);

  return app;
}

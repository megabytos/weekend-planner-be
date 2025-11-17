import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
    ZodTypeProvider,
    serializerCompiler,
    validatorCompiler,
    jsonSchemaTransform,
} from 'fastify-type-provider-zod';
import { z } from 'zod';

import prismaPlugin from './plugins/prisma.js';
import redisPlugin from './plugins/redis.js';
import registerRoutes from './routes/index.js';

const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);
await app.register(cors, { origin: true });
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
await app.register(swagger, {
  openapi: {
    info: {
      title: process.env.SWAGGER_TITLE || 'WeekendPlanner API',
      version: process.env.SWAGGER_VERSION || '0.1.0',
      description: 'Backend API for WeekendPlanner. This is a skeleton; endpoints will evolve.'
    },
  },
    transform: jsonSchemaTransform,
});
await app.register(swaggerUi, { routePrefix: '/docs' });

await app.register(prismaPlugin);
await app.register(redisPlugin);

// Health route
app.get('/health', {
  schema: {
    description: 'Health check endpoint',
    tags: ['system'],
    response: {
      200: z.object({ status: z.literal('ok'), uptime: z.number(), env: z.string() })
    }
  }
}, async (req, reply) => {
  return { status: 'ok', uptime: process.uptime(), env: process.env.NODE_ENV || 'development' } as const;
});

// Version route
app.get('/version', {
  schema: {
    description: 'Returns service version',
    tags: ['system'],
    response: {
      200: z.object({ version: z.string() })
    }
  }
}, async () => ({ version: process.env.SWAGGER_VERSION || '0.1.0' }));

await app.register(registerRoutes);

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

try {
  await app.listen({ port, host });
  app.log.info(`Server listening at http://${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

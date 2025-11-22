// Environment validation using Zod
import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),

  // Swagger/metadata
  SWAGGER_TITLE: z.string().default('WeekendPlanner API'),
  SWAGGER_VERSION: z.string().default('0.1.0'),

  // Database/Cache
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgresql://')).optional(),
  REDIS_URL: z.string().url().optional(),

  // External API keys/tokens
  TICKETMASTER_API_KEY: z.string().optional(),
  PREDICTHQ_TOKEN: z.string().optional(),
  GEOAPIFY_API_KEY: z.string().optional(),
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  FOURSQUARE_API_KEY: z.string().optional(),

  // Auth/JWT
  JWT_SECRET: z.string().min(16).default('dev-secret-change-me'),
  JWT_EXPIRES_IN: z.string().default('15m'), // e.g., '15m', '1h'
  JWT_REFRESH_EXPIRES_DAYS: z.coerce.number().int().positive().default(30),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // In dev we log a readable error; in prod you may prefer to throw.
  // We still throw to fail fast when critical vars are missing.
  // ZodError includes detailed issues list.
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten());
  throw new Error('ENV validation failed');
}

export const config = {
  ...parsed.data,
};

export type AppConfig = typeof config;

import 'fastify';
import type { AppConfig } from '../config/env.js';
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    redis: Redis;
    config: AppConfig;
    authenticate: (req: FastifyRequest) => Promise<void>;
    authorize: (roles: Array<'ADMIN' | 'PARTNER' | 'USER'>) => (req: FastifyRequest, reply: any) => Promise<void>;
  }
  interface FastifyRequest {
    user?: {
        id: string;
        role: 'ADMIN' | 'PARTNER' | 'USER';
        scope?: string[]
    };
  }
}

export {};

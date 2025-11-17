// Fastify plugin to expose a Redis client via app.redis
import fp from 'fastify-plugin';
import Redis from 'ioredis';
import type { Redis as RedisClient } from 'ioredis';

declare module 'fastify' {
    interface FastifyInstance {
        redis: RedisClient;
    }
}

const redisPlugin = fp(async (app) => {
    const url = process.env.REDIS_URL || 'redis://localhost:6379/0';
    const redis = new Redis(url);

    app.decorate('redis', redis);

    app.addHook('onClose', async () => {
        await redis.quit();
    });
});

export default redisPlugin;

import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: any, reply: any) => Promise<void>;
  }
  interface FastifyRequest {
    currentUser?: {
      id: string;
      email: string;
    };
  }
}

const jwtPlugin = fp(async (app) => {
  const secret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
  
  await app.register(jwt, {
    secret,
  });

  app.decorate('authenticate', async function (request: any, reply: any) {
    try {
      const decoded = await request.jwtVerify();
      request.currentUser = {
        id: decoded.id as string,
        email: decoded.email as string,
      };
    } catch (err) {
      reply.status(401).send({ error: 'Unauthorized' });
    }
  });
});

export default jwtPlugin;


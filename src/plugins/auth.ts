// Auth plugin: JWT verification + role-based authorization guards

import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';

type Role = 'ADMIN' | 'PARTNER' | 'USER';

type JwtUserPayload = jwt.JwtPayload & {
  sub?: string;
  role?: Role;
  scope?: string[];
};

declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: string; role: Role; scope?: string[] };
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest) => Promise<void>;
    authorize: (roles: Role[]) => (req: FastifyRequest, reply: any) => Promise<void>;
  }
}

async function plugin(app: FastifyInstance) {
  const { JWT_SECRET } = app.config;

  // Verifies Authorization: Bearer <token>, decodes payload, and attaches request.user
  app.decorate('authenticate', async function authenticate(req: FastifyRequest) {
    const header = req.headers['authorization'];
    if (!header || !header.startsWith('Bearer ')) {
      const err: any = new Error('Unauthorized');
      err.statusCode = 401;
      throw err;
    }
    const token = header.substring('Bearer '.length).trim();
    try {
      const payload = jwt.verify(token, JWT_SECRET) as JwtUserPayload;
      const role: Role = (payload.role as Role) ?? 'USER';
      const id = (payload.sub as string) ?? '';
      // Attach user to request
      req.user = { id, role, scope: Array.isArray(payload.scope) ? payload.scope : undefined };
    } catch (e: any) {
      const err: any = new Error('Invalid token');
      err.statusCode = 401;
      throw err;
    }
  });

  // Returns an onRequest hook that requires one of the specified roles
  app.decorate('authorize', function authorize(roles: Role[]) {
    return async function (req: FastifyRequest) {
      // Ensure authentication first
      await (app as any).authenticate(req);
      const userRole = req.user?.role;
      if (!userRole || !roles.includes(userRole)) {
        const err: any = new Error('Forbidden');
        err.statusCode = 403;
        throw err;
      }
    };
  });
}

export default fp(plugin, { name: 'auth-plugin' });

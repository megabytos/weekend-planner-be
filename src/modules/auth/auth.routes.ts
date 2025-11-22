import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  LoginBodySchema,
  TokensResponseSchema,
  RefreshBodySchema,
  LogoutBodySchema,
  ForgotPasswordBodySchema,
  ForgotPasswordResponseSchema,
  ResetPasswordBodySchema,
  ResetPasswordResponseSchema,
  LogoutResponseSchema
} from './auth.schemas.js';
import { login, refresh, logout } from './auth.service.js';



// Auth routes under /api/auth
export default async function authRoutes(app: FastifyInstance) {
  app.post(
    '/login',
    {
      schema: {
        description: 'Authenticates user, returns access and refresh tokens',
        tags: ['auth'],
        body: LoginBodySchema,
        response: { 200: TokensResponseSchema },
      },
    },
    async (req) => {
      const body = LoginBodySchema.parse(req.body);
      const res = await login(app, body);
      return res;
    }
  );

  app.post(
    '/refresh',
    {
      schema: {
        description: 'Rotates refresh token and returns a new access token',
        tags: ['auth'],
        body: RefreshBodySchema,
        response: { 200: TokensResponseSchema },
      },
    },
    async (req) => {
      const body = RefreshBodySchema.parse(req.body);
      const res = await refresh(app, body.refreshToken);
      return res;
    }
  );

    app.post(
        '/logout',
        {
            schema: {
                description: 'Invalidates refresh token',
                tags: ['auth'],
                body: LogoutBodySchema,
                response: { 200: LogoutResponseSchema },
            },
        },
        async (req) => {
            const body = LogoutBodySchema.parse(req.body);
            const res = await logout(app, body.refreshToken);
            return res;
        }
    );

  app.post(
    '/forgot-password',
    {
      schema: {
        description: 'Requests password reset email (placeholder)',
        tags: ['auth'],
        body: ForgotPasswordBodySchema,
        response: { 200: ForgotPasswordResponseSchema },
      },
    },
    async () => {
      // TODO: implement email delivery with token persistence
      return { sent: true } as const;
    }
  );

  app.post(
    '/reset-password',
    {
      schema: {
        description: 'Resets password with provided token (placeholder)',
        tags: ['auth'],
        body: ResetPasswordBodySchema,
        response: { 200: ResetPasswordResponseSchema },
      },
    },
    async () => {
      // TODO: implement token verification and password update
      return { reset: true } as const;
    }
  );
}

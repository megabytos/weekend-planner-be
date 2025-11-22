import { z } from 'zod';
import {FastifyInstance} from "fastify";

// Common primitives
export const ScopeSchema = z.union([z.string(), z.array(z.string())]).optional();

// Roles
export const RoleEnum = z.enum(['ADMIN', 'PARTNER', 'USER']);
export type Role = z.infer<typeof RoleEnum>;

// Login
export const LoginBodySchema = z.object({
  email: z.email(),
  password: z.string().min(1),
  scope: ScopeSchema,
  // Temporary until real DB is wired: allow specifying role to get correct cabinet access
  // In production, role must be taken from database/user record and ignored in input
  role: RoleEnum.optional(),
});

export const LogoutResponseSchema = z.object({
    success: z.boolean(),
});
export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;

export const TokensResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int().positive(),
  refreshToken: z.string().optional(),
  scope: z.array(z.string()).optional(),
  role: RoleEnum,
});

// Refresh
export const RefreshBodySchema = z.object({
  refreshToken: z.string().min(1),
});

// Logout
export const LogoutBodySchema = z.object({
  refreshToken: z.string().min(1),
});

// Forgot password
export const ForgotPasswordBodySchema = z.object({
  email: z.email(),
});

export const ForgotPasswordResponseSchema = z.object({ sent: z.boolean() });

// Reset password
export const ResetPasswordBodySchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(6),
});

export const ResetPasswordResponseSchema = z.object({ reset: z.boolean() });

export type LoginBody = z.infer<typeof LoginBodySchema>;
export type RefreshBody = z.infer<typeof RefreshBodySchema>;
export type LogoutBody = z.infer<typeof LogoutBodySchema>;
import { z } from 'zod';

// Common primitives
export const ScopeSchema = z.union([z.string(), z.array(z.string())]).optional();

// Roles
export const RoleEnum = z.enum(['ADMIN', 'PARTNER', 'USER']);
export type Role = z.infer<typeof RoleEnum>;

// Login
const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(128, 'Password must be at most 128 characters long')
  .refine((value) => /[A-Za-z]/.test(value), {
    message: 'Password must contain at least one letter',
  })
  .refine((value) => /\d/.test(value), {
    message: 'Password must contain at least one digit',
  });

export const LoginBodySchema = z.object({
  email: z.email(),
  password: PasswordSchema,
  scope: ScopeSchema,
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

export const RegisterBodySchema = z.object({
  email: z.email(),
  password: PasswordSchema,
  name: z.string().trim().min(2).max(120).optional(),
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
export type RegisterBody = z.infer<typeof RegisterBodySchema>;
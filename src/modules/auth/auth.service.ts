import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { User } from '@prisma/client';
import type { LoginBody, RegisterBody, Role } from './auth.schemas.js';

export type AuthResult = {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  scope?: string[];
  role: Role;
};

const PASSWORD_SALT_ROUNDS = 12;

function normalizeScope(scope?: string | string[]) {
  if (!scope) return undefined;
  return Array.isArray(scope) ? scope : [scope];
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function ensureRedis(app: FastifyInstance) {
  if (!app.redis) {
    const err: any = new Error('Redis is not configured');
    err.statusCode = 500;
    throw err;
  }
  return app.redis;
}

function invalidCredentialsError() {
  const err: any = new Error('Invalid credentials');
  err.statusCode = 401;
  return err;
}

async function hashPassword(password: string) {
  return bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
}

async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

type TokenizableUser = Pick<User, 'id' | 'role'>;

async function issueTokens(app: FastifyInstance, user: TokenizableUser, scope?: string[]): Promise<AuthResult> {
  const normalizedScope = scope && scope.length ? scope : undefined;
  const role = user.role as Role;
  const { JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_DAYS } = app.config;
  const jwtSecret = JWT_SECRET as jwt.Secret;
  const accessExpiresIn = JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'];
  const accessPayload: jwt.JwtPayload = { sub: user.id, scope: normalizedScope, role };
  const accessToken = jwt.sign(accessPayload, jwtSecret, { expiresIn: accessExpiresIn });

  const refreshToken = `r_${randomUUID()}`;
  const ttlSeconds = Math.max(1, (JWT_REFRESH_EXPIRES_DAYS || 30) * 24 * 60 * 60);

  const redis = ensureRedis(app);
  await redis.set(
    `refresh:${refreshToken}`,
    JSON.stringify({ sub: user.id, scope: normalizedScope, role }),
    'EX',
    ttlSeconds
  );

  const expiresIn = parseExpiresInToSeconds(app.config.JWT_EXPIRES_IN) ?? 900;

  return { accessToken, refreshToken, expiresIn, scope: normalizedScope, role };
}

export async function login(app: FastifyInstance, body: LoginBody): Promise<AuthResult> {
  const email = normalizeEmail(body.email);
  const scope = normalizeScope(body.scope);

  const user = await app.prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    throw invalidCredentialsError();
  }

  const passwordOk = await verifyPassword(body.password, user.passwordHash);
  if (!passwordOk) {
    throw invalidCredentialsError();
  }

  return issueTokens(app, { id: user.id, role: user.role }, scope);
}

export async function register(app: FastifyInstance, body: RegisterBody): Promise<AuthResult> {
  const email = normalizeEmail(body.email);
  const existing = await app.prisma.user.findUnique({ where: { email } });
  if (existing) {
    const err: any = new Error('User with this email already exists');
    err.statusCode = 409;
    throw err;
  }

  const passwordHash = await hashPassword(body.password);
  const user = await app.prisma.user.create({
    data: {
      email,
      passwordHash,
      role: 'USER',
      name: body.name?.trim() || null,
    },
  });

  return issueTokens(app, { id: user.id, role: user.role });
}

export async function refresh(app: FastifyInstance, refreshToken: string): Promise<AuthResult> {
  const redis = ensureRedis(app);
  const raw = await redis.get(`refresh:${refreshToken}`);
  if (!raw) {
    const err: any = new Error('Invalid refresh token');
    err.statusCode = 401;
    throw err;
  }
  let parsed: { sub: string; scope?: string[]; role?: Role } | null = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (!parsed?.sub) {
    const err: any = new Error('Invalid refresh token');
    err.statusCode = 401;
    throw err;
  }

  // Rotate refresh token: delete old and create new
  await redis.del(`refresh:${refreshToken}`);
  const user = await app.prisma.user.findUnique({ where: { id: parsed.sub } });
  if (!user) {
    const err: any = new Error('User is no longer available');
    err.statusCode = 401;
    throw err;
  }

  return issueTokens(app, { id: user.id, role: user.role }, parsed.scope);
}

export async function logout(app: FastifyInstance, refreshToken: string) {
  const redis = ensureRedis(app);
  await redis.del(`refresh:${refreshToken}`);
  return { success: true } as const;
}

// Utilities
function parseExpiresInToSeconds(expr: string | undefined): number | null {
  if (!expr) return null;
  const m = String(expr).match(/^(\d+)([smhd])?$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = (m[2] || 's').toLowerCase();
  switch (unit) {
    case 's':
      return n;
    case 'm':
      return n * 60;
    case 'h':
      return n * 3600;
    case 'd':
      return n * 86400;
    default:
      return null;
  }
}

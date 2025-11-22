import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { LoginBody, Role  } from './auth.schemas.js';

export type LoginResult = {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  scope?: string[];
  role: Role;
};

function normalizeScope(scope?: string | string[]) {
  if (!scope) return undefined;
  return Array.isArray(scope) ? scope : [scope];
}

export async function login(app: FastifyInstance, body: LoginBody): Promise<LoginResult> {
  const { email, password } = body;
  const scope = normalizeScope(body.scope);
  const role = body.role ?? 'USER';

  // TODO: Replace with real user lookup & password verification (bcrypt/argon2)
  if (!email || !password) {
    const err: any = new Error('Invalid credentials');
    err.statusCode = 401;
    throw err;
  }

  const { JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_DAYS } = app.config;
  const jwtSecret = JWT_SECRET as jwt.Secret;
  const accessExpiresIn = JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'];
  // Create access token (JWT)
  const accessPayload: jwt.JwtPayload = { sub: email, scope, role };
  const accessToken = jwt.sign(accessPayload, jwtSecret, { expiresIn: accessExpiresIn });

  // Create opaque refresh token and store in Redis with TTL
  const refreshToken = `r_${randomUUID()}`;
  const ttlSeconds = Math.max(1, (JWT_REFRESH_EXPIRES_DAYS || 30) * 24 * 60 * 60);
  const refreshData = { sub: email, scope, role };

  if (!app.redis) {
    const err: any = new Error('Redis is not configured');
    err.statusCode = 500;
    throw err;
  }
  await app.redis.set(`refresh:${refreshToken}`, JSON.stringify(refreshData), 'EX', ttlSeconds);

  // Compute expiresIn seconds for access token
  // jsonwebtoken doesn't expose numeric exp easily; rely on config parse assumptions is unsafe.
  // For API contract we expose a best-effort value based on common formats: <number>[smhd]
  const expiresIn = parseExpiresInToSeconds(JWT_EXPIRES_IN) ?? 900; // default 15m

  return { accessToken, refreshToken, expiresIn, scope: scope && scope.length ? scope : undefined, role };
}

export async function refresh(app: FastifyInstance, refreshToken: string) {
  if (!app.redis) {
    const err: any = new Error('Redis is not configured');
    err.statusCode = 500;
    throw err;
  }
  const raw = await app.redis.get(`refresh:${refreshToken}`);
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
  await app.redis.del(`refresh:${refreshToken}`);
  const newRefresh = `r_${randomUUID()}`;
  const ttlSeconds = Math.max(1, (app.config.JWT_REFRESH_EXPIRES_DAYS || 30) * 24 * 60 * 60);
  await app.redis.set(
    `refresh:${newRefresh}`,
    JSON.stringify({ sub: parsed.sub, scope: parsed.scope, role: parsed.role ?? 'USER' }),
    'EX',
    ttlSeconds
  );

  // Issue new access token
  const { JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_DAYS } = app.config;
  const jwtSecret = JWT_SECRET as jwt.Secret;
  const accessExpiresIn = JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'];
  const payload: jwt.JwtPayload = { sub: parsed.sub, scope: parsed.scope, role: parsed.role ?? 'USER' };
  const accessToken = jwt.sign(payload, jwtSecret, { expiresIn: accessExpiresIn });
  const expiresIn = parseExpiresInToSeconds(app.config.JWT_EXPIRES_IN) ?? 900;

  return { accessToken, refreshToken: newRefresh, expiresIn, scope: parsed.scope, role: (parsed.role ?? 'USER') as Role };
}

export async function logout(app: FastifyInstance, refreshToken: string) {
  if (!app.redis) {
    const err: any = new Error('Redis is not configured');
    err.statusCode = 500;
    throw err;
  }
  await app.redis.del(`refresh:${refreshToken}`);
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

// Common error classes and Fastify error mapping utilities

export class AppError extends Error {
  statusCode: number;
  code?: string;
  details?: unknown;
  constructor(message: string, statusCode = 400, options?: { code?: string; details?: unknown }) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = options?.code;
    this.details = options?.details;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404, { code: 'NOT_FOUND' });
    this.name = 'NotFoundError';
  }
}

export function toErrorResponse(err: unknown): { statusCode: number; body: any } {
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      body: { message: err.message, code: err.code, details: err.details },
    };
  }
  return { statusCode: 500, body: { message: 'Internal Server Error' } };
}

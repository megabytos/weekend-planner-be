import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export default async function authRoutes(app: FastifyInstance) {
  // Register endpoint
  app.post('/register', {
    schema: {
      description: 'Register a new user',
      tags: ['auth'],
      body: registerSchema,
      response: {
        201: z.object({
          user: z.object({
            id: z.string(),
            email: z.string(),
            name: z.string().nullable(),
          }),
          token: z.string(),
        }),
        400: z.object({
          error: z.string(),
        }),
        409: z.object({
          error: z.string(),
        }),
      },
    },
  }, async (request, reply) => {
    const { email, password, name } = registerSchema.parse(request.body);

    const existingUser = await app.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return reply.status(409).send({ error: 'User with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await app.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: name || null,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    const token = app.jwt.sign({
      id: user.id,
      email: user.email,
    });

    return reply.status(201).send({ user, token });
  });

  // Login endpoint
  app.post('/login', {
    schema: {
      description: 'Login user',
      tags: ['auth'],
      body: loginSchema,
      response: {
        200: z.object({
          user: z.object({
            id: z.string(),
            email: z.string(),
            name: z.string().nullable(),
          }),
          token: z.string(),
        }),
        401: z.object({
          error: z.string(),
        }),
      },
    },
  }, async (request, reply) => {
    const { email, password } = loginSchema.parse(request.body);

    const user = await app.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const token = app.jwt.sign({
      id: user.id,
      email: user.email,
    });

    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      token,
    });
  });

  // Get current user endpoint (protected)
  app.get('/me', {
    onRequest: [app.authenticate],
    schema: {
      description: 'Get current authenticated user',
      tags: ['auth'],
      response: {
        200: z.object({
          user: z.object({
            id: z.string(),
            email: z.string(),
            name: z.string().nullable(),
          }),
        }),
        401: z.object({
          error: z.string(),
        }),
      },
    },
  }, async (request, reply) => {
    if (!request.currentUser) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const user = await app.prisma.user.findUnique({
      where: { id: request.currentUser.id },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    if (!user) {
      return reply.status(401).send({ error: 'User not found' });
    }

    return reply.send({ user });
  });
}


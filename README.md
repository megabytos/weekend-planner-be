# WeekendPlanner Backend

Stack: Node.js, Fastify, Prisma, Zod, PostgreSQL, Redis, Swagger.

What is included
- TypeScript Fastify server with CORS, rate limit, Swagger (OpenAPI) and Swagger-UI at /docs.
- Health endpoints: /health, /version and /api/system/ping.
- Plugins: Prisma, Redis.
- Search module skeleton with Zod request/response schemas and POST /api/search returning empty items.
- /api/search integrates external event sources (Ticketmaster, PredictHQ) when API keys are provided.
- Prisma schema with initial models and migrations.
- .env.example with required variables.

Getting started
1. Copy .env.example to .env and review variables.
2. Install dependencies:
   npm install
3. Run dev server:
   npm run dev
4. Open docs:
   http://localhost:3000/docs


Migrations (PostgreSQL)

1. Ensure DATABASE_URL is set in .env (see .env.example). Example:
   postgresql://user:password@localhost:5432/weekendplanner?schema=public
2. Create and apply migrations in dev (creates DB if missing):
   npm run migrate:dev
3. Apply existing migrations (CI/prod):
   npm run migrate:deploy
4. Reset dev database (DANGEROUS: drops DB):
   npm run migrate:reset
5. Generate Prisma Client after schema changes:
   npm run prisma:generate

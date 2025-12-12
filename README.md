# WeekendPlanner Backend

Backend API for WeekendPlanner — a service that helps users discover **nearby places** and **events** (especially for weekends), aggregates data from multiple external providers, stores normalized entities in PostgreSQL, and serves a unified search response suitable for a map-based frontend.


**Stack:** Node.js, Fastify, Prisma, Zod, PostgreSQL, Redis, Swagger.


## What is implemented

### 1) HTTP API server
- TypeScript Fastify server with CORS, rate limiting, logging.
- OpenAPI (Swagger) documentation auto-generated from route schemas.
- Basic health endpoints.

### 2) Unified Search API
`GET /api/search` — main search endpoint.
The search API returns a single list of mixed **places** and **events** for map rendering.
Request supports:
- `target`: `places | events | both`
- `where`: `city` and/or `geo` and/or `bbox`
- `when`: preset or ISO range
- `filters`: categories, sources, price tier, etc.
- `pagination`: `limit`, `offset`, `page`
- `sort`: rank/distance/start_time/price/rating

MVP behavior:
- **First page request** triggers **online ingestion**:
  1) call external providers (events + places),
  2) normalize data to internal DTOs,
  3) deduplicate + merge,
  4) upsert into PostgreSQL (via Prisma),
  5) query DB and return ranked hits.
- **Non-first pages** DO NOT call external APIs again:
  - results are served from DB only, with the same ranking & paging logic.

Supported external providers:
- Events: Ticketmaster, PredictHQ
- Places: Geoapify, Google Places, Foursquare

### 3) Persistence & ranking (Postgres)
Search results returned by `/api/search` are fetched from our own DB and ranked using internal scoring fields (quality/popularity/freshness + distance penalty when geo is provided).

### 4) Caching (Redis)
Search responses can be cached in Redis, including SWR (stale-while-revalidate) behavior.
Cache behavior is configurable via environment variables (see `.env.example`).

### 5) Auth (JWT) + role-based access
JWT-based auth is implemented. Route groups are protected by roles:
- USER / PARTNER / ADMIN: profiles
- PARTNER / ADMIN: partner cabinet routes
- ADMIN: admin routes
- USER / PARTNER / ADMIN: users routes


## Project structure
- `src/app.ts` — Fastify app factory (CORS, rate-limit, Swagger, plugins, routes)
- `src/index.ts` — server entrypoint
- `src/plugins/*` — prisma, redis, auth, logger
- `src/modules/*` — domain modules:
  - `search` — unified search endpoint + schemas
  - `ingestion` — ingestion pipeline utilities (used by search for online ingest)
  - `catalog` — places/events/taxonomy endpoints (DB read APIs)
  - `auth` — authentication endpoints (register/login/refresh/logout, JWT token lifecycle)
  - `users` — authenticated user account APIs (basic user info and account operations)
  - `profiles` — user profile/preferences APIs (protected for USER/PARTNER/ADMIN roles)
  - `partner` — partner cabinet APIs for managing/importing partner content (protected for PARTNER/ADMIN)
  - `admin` — admin/backoffice APIs for moderation and management (protected for ADMIN)
  - `groups` — group collaboration APIs (membership/invites and shared planning scaffolding)
  - `reviews` — reviews/ratings APIs for places/events (UGC layer scaffolding)
  - `notifications` — notifications/subscriptions APIs (user notification settings scaffolding)
  - `geo` — geospatial helpers and city/bbox lookups used by search and ingestion
  - `planner` — planning/itinerary APIs (plan building and routing scaffolding)
  - `system` — system endpoints (ping/service info) and health/version endpoints

## Requirements
- Node.js 
- PostgreSQL
- Redis

Getting started
1. Copy .env.example to .env and review variables.
2. At minimum you need:
   - `DATABASE_URL` (PostgreSQL)
   - `REDIS_URL` (Redis)
   - `JWT_SECRET` (use a strong value in prod)
3. Install dependencies:
```bash
   npm install
```
4. Run dev server:
```bash
   npm run dev
```
5. Open docs (Swagger UI):
   http://localhost:3000/docs

Environment variables for external APIs
- TICKETMASTER_API_KEY — Ticketmaster Discovery API key
- PREDICTHQ_TOKEN — PredictHQ Personal Access Token
- GEOAPIFY_API_KEY — Geoapify Places API key
- GOOGLE_PLACES_API_KEY — Google Places Web Service API key
- FOURSQUARE_API_KEY — Foursquare Places API key (v3)


Migrations (PostgreSQL)

1. Ensure DATABASE_URL is set in .env (see .env.example). Example:
   postgresql://user:password@localhost:5432/weekendplanner?schema=public
2. Create and apply migrations in dev (creates DB if missing):
```bash
   npm run migrate:dev
```
3. Apply existing migrations (CI/prod):
```bash
   npm run migrate:deploy
```
4. Reset dev database (DANGEROUS: drops DB):
```bash
   npm run migrate:reset
```
5. Generate Prisma Client after schema changes:
```bash
   npm run prisma:generate
   ````
6. Seed reference data:
```bash
   npm run seed:all
```

## Testing
To run tests:
```bash
   npm run test
```
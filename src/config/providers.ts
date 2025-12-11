import type { SourceType } from "../modules/search/search.schemas.js";

// Per‑provider fetch limits for online ingest. Can be tuned per environment.
export const PROVIDER_LIMITS: Record<SourceType, number> = {
  TICKETMASTER: 100,
  PREDICTHQ: 100,
  GEOAPIFY: 100,
  GOOGLE_PLACES: 100,
  FOURSQUARE: 100,
  PARTNER: 0, // partner/internal curated data isn't fetched via external API
  MANUAL: 0,   // edited in admin; no external fetch
} as const;

// Global cap for the total number of normalized objects collected per request
export const GLOBAL_INGEST_LIMIT = 500;

// Default geo dedup radius in meters (heuristic fallback when no Source link exists)
export const DEDUP_RADIUS_METERS_DEFAULT = 50;

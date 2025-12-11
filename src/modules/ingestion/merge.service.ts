import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { SourceType } from "../search/search.schemas.js";
import type { NormalizedPlaceLike, NormalizedEventLike } from "./dedup.service.js";

export enum SourcePriority {
  MANUAL = 100,
  PARTNER = 90,
  GOOGLE_PLACES = 80,
  TICKETMASTER = 75,
  PREDICTHQ = 70,
  FOURSQUARE = 65,
  GEOAPIFY = 60,
  OTHER = 50,
}

export function sourcePriorityOf(src: SourceType): number {
  switch (src) {
    case "MANUAL":
      return SourcePriority.MANUAL;
    case "PARTNER":
      return SourcePriority.PARTNER; // curated/partner data
    case "GOOGLE_PLACES":
      return SourcePriority.GOOGLE_PLACES;
    case "TICKETMASTER":
      return SourcePriority.TICKETMASTER;
    case "PREDICTHQ":
      return SourcePriority.PREDICTHQ;
    case "FOURSQUARE":
      return SourcePriority.FOURSQUARE;
    case "GEOAPIFY":
      return SourcePriority.GEOAPIFY;
    default:
      return SourcePriority.OTHER;
  }
}

export function computeChecksum(normalized: unknown): string {
  const json = JSON.stringify(normalized ?? {});
  return crypto.createHash("sha256").update(json).digest("hex");
}

export class IngestionMergeService {
  // MVP: build minimal updates; extend later per field policies
  buildPlaceUpdate(
    existing: { name: string | null; address: string | null; imageUrl?: string | null; url?: string | null; rating?: number | null; reviewCount?: number | null },
    normalized: NormalizedPlaceLike,
    sourceType: SourceType,
    sourceUpdatedAt?: Date | null
  ): Prisma.PlaceUpdateInput | null {
    const update: Prisma.PlaceUpdateInput = {};

    // do not overwrite good values with empties
    if ((!existing.name || existing.name.length === 0) && normalized.name) {
      update.name = normalized.name;
    }
    if ((!existing.address || existing.address.length === 0) && normalized.address) {
      update.address = normalized.address;
    }
    if (normalized.location?.lat != null && normalized.location?.lon != null) {
      // only set coordinates if missing
      // Prisma Decimal fields accept number
      (update as any).lat ??= normalized.location.lat;
      (update as any).lng ??= normalized.location.lon;
    }

    // imageUrl: set only if missing and incoming has a value
    if ((!existing.imageUrl || existing.imageUrl.length === 0) && normalized.imageUrl) {
      (update as any).imageUrl = normalized.imageUrl;
    }

    // url: set only if missing and incoming has a non-empty value
    if ((!existing.url || existing.url.length === 0) && normalized.url) {
      (update as any).url = normalized.url;
    }

    // rating/reviewCount: set if missing/zero and incoming has values
    if ((existing.rating == null) && (normalized.rating != null)) {
      (update as any).rating = normalized.rating;
    }
    if (((existing.reviewCount as any) == null || (existing.reviewCount as any) === 0) && (normalized.reviewCount != null)) {
      (update as any).reviewCount = Math.max(0, Math.floor(normalized.reviewCount));
    }

    return Object.keys(update).length ? update : null;
  }

  buildEventUpdate(
    existing: { title: string | null; description: string | null; imageUrl: string | null },
    normalized: NormalizedEventLike,
    sourceType: SourceType,
    sourceUpdatedAt?: Date | null
  ): Prisma.EventUpdateInput | null {
    const update: Prisma.EventUpdateInput = {};

    if ((!existing.title || existing.title.length === 0) && normalized.title) {
      (update as any).title = normalized.title;
    }
    if ((!existing.description || existing.description.length === 0) && normalized.description) {
      (update as any).description = normalized.description;
    }
    if ((!existing.imageUrl || existing.imageUrl.length === 0) && normalized.imageUrl) {
      (update as any).imageUrl = normalized.imageUrl;
    }
    return Object.keys(update).length ? update : null;
  }
}

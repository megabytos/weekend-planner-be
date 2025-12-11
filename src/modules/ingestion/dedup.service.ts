import type { PrismaClient, Prisma } from "@prisma/client";
import type { SourceType } from "../search/search.schemas.js";

export type NormalizedPlaceLike = {
  id?: string; // provider-internal
  name?: string;
  location?: { lat: number; lon: number } | null;
  address?: string | null;
  url?: string | null;
  imageUrl?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  cityId?: string | null; // our city identifier, if resolved
  categories?: string[]; // taxonomy slugs
  // raw provider categories for diagnostics/mapping (stored as comma-separated string on canonical)
  providerCategoriesRaw?: string[];
  source: { source: SourceType; externalId: string; url?: string };
  sourceUpdatedAt?: string | null;
};

export type NormalizedEventLike = {
  id?: string; // provider-internal
  title?: string;
  description?: string | null;
  url?: string | null;
  imageUrl?: string | null;
  location?: { lat: number; lon: number } | null;
  address?: string | null;
  cityId?: string | null;
  time?: { start: string; end?: string; timezone?: string } | null;
  categories?: string[]; // taxonomy slugs
  // raw provider categories for diagnostics/mapping (stored as comma-separated string on canonical)
  providerCategoriesRaw?: string[];
  // Extended fields for richer Event details
  priceFrom?: number | null;
  priceTo?: number | null;
  currency?: string | null;
  isOnline?: boolean | null;
  ageLimit?: number | null;
  languages?: string[] | null;
  ticketsUrl?: string | null;
  source: { source: SourceType; externalId: string; url?: string };
  sourceUpdatedAt?: string | null;
};

export type MatchReason =
  | { type: "SOURCE" }
  | { type: "GEO_NAME"; distanceMeters?: number };

export type MatchResult<T extends "place" | "event"> = {
  targetType: T;
  id: string; // canonical id (Place.id or Event.id)
  reason: MatchReason;
};

export class IngestionDedupService {
  constructor(private readonly prisma: PrismaClient, private readonly geoRadiusMeters = 100) {}

  // MVP stub: only matches by PlaceSource(source, externalId). Heuristics will be added later.
  async matchOrCreatePlace(normalized: NormalizedPlaceLike): Promise<MatchResult<"place">> {
    const { source, name } = normalized;
    // Fast path by PlaceSource
    const ps = await this.prisma.placeSource.findUnique({
      where: { source_externalId: { source: source.source, externalId: source.externalId } },
      select: { placeId: true },
    });
    if (ps) return { targetType: "place", id: ps.placeId, reason: { type: "SOURCE" } };

    // Heuristic match by GEO + NAME within radius
    const loc = normalized.location;
    if (loc && loc.lat != null && loc.lon != null) {
      const candidate = await this.findNearestPlaceByGeoAndName(loc.lat, loc.lon, name ?? null, normalized.cityId ?? null);
      if (candidate) {
        return { targetType: "place", id: candidate.id, reason: { type: "GEO_NAME", distanceMeters: Math.round(candidate.d) } };
      }
    }

    // Require coordinates for Place creation to satisfy Prisma non-null decimals
    if (!loc || loc.lat == null || loc.lon == null) {
      throw new Error(`Cannot create Place without coordinates for source=${source.source} externalId=${source.externalId}`);
    }

    // Schema requires Place.city relation — ensure we have cityId
    if (!normalized.cityId) {
      throw new Error(`Cannot create Place without cityId for source=${source.source} externalId=${source.externalId}`);
    }

    // Create a new Place (minimal fields)
    const placeData: Prisma.PlaceCreateInput = {
      name: name || "",
      // Place has Decimal lat/lng
      lat: loc.lat,
      lng: loc.lon,
      address: normalized.address ?? null,
      url: normalized.url ?? null,
      imageUrl: normalized.imageUrl ?? null,
      rating: normalized.rating ?? null,
      reviewCount: normalized.reviewCount != null ? Math.max(0, Math.floor(normalized.reviewCount)) : 0,
      city: { connect: { id: normalized.cityId } },
      // remember which provider created this canonical record
      provider: normalized.source.source as any,
    };
    const created = await this.prisma.place.create({
      data: placeData,
      select: { id: true },
    });
    return { targetType: "place", id: created.id, reason: { type: "GEO_NAME" } };
  }

  // MVP stub: only matches by EventSource(source, externalId). Heuristics will be added later.
  async matchOrCreateEvent(normalized: NormalizedEventLike): Promise<MatchResult<"event">> {
    const { source, title } = normalized;
    // Fast path by EventSource
    const es = await this.prisma.eventSource.findUnique({
      where: { source_externalId: { source: source.source, externalId: source.externalId } },
      select: { eventId: true },
    });
    if (es) return { targetType: "event", id: es.eventId, reason: { type: "SOURCE" } };

    // Heuristic: same cityId and same normalized title (case-insensitive)
    const normTitle = this.normalizeStr(title ?? "");
    if (normTitle && normalized.cityId) {
      const existingSame = await this.prisma.event.findFirst({
        where: {
          cityId: normalized.cityId,
          title: { equals: title ?? "", mode: 'insensitive' as any },
        },
        select: { id: true },
      });
      if (existingSame) {
        return { targetType: "event", id: existingSame.id, reason: { type: "GEO_NAME" } };
      }
    }

    // Create a new Event (minimal fields). Occurrences handling will be refined later.
    if (!normalized.cityId) {
      throw new Error(`Cannot create Event without cityId for source=${source.source} externalId=${source.externalId}`);
    }
    const eventData: Prisma.EventCreateInput = {
      title: title || "",
      description: normalized.description ?? null,
      imageUrl: normalized.imageUrl ?? null,
      city: { connect: { id: normalized.cityId } },
      provider: normalized.source.source as any,
    };
    const created = await this.prisma.event.create({
      data: eventData,
      select: { id: true },
    });
    return { targetType: "event", id: created.id, reason: { type: "GEO_NAME" } };
  }

  // ---------- helpers ----------
  private normalizeStr(s: string): string {
    return s.trim().toLowerCase().replace(/\s+/g, " ");
  }

  private static haversineMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
    const R = 6371e3; // meters
    const toRad = (x: number) => (x * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
    return R * c;
  }

  private async findNearestPlaceByGeoAndName(
    lat: number,
    lon: number,
    name: string | null,
    cityId: string | null
  ): Promise<{ id: string; d: number } | null> {
    // bbox prefilter
    const km = this.geoRadiusMeters / 1000;
    const degLat = km / 111.32;
    const degLon = km / (111.32 * Math.cos((lat * Math.PI) / 180) || 1);
    const minLat = lat - degLat;
    const maxLat = lat + degLat;
    const minLon = lon - degLon;
    const maxLon = lon + degLon;

    const where: any = {
      isActive: true,
      moderation: 'APPROVED',
      lat: { gte: minLat as any, lte: maxLat as any },
      lng: { gte: minLon as any, lte: maxLon as any },
    };
    if (cityId) where.cityId = cityId;

    const candidates = await this.prisma.place.findMany({
      where,
      select: { id: true, name: true, lat: true, lng: true },
      take: 30,
    });

    if (!candidates.length) return null;
    const normName = name ? this.normalizeStr(name) : "";
    let best: { id: string; d: number } | null = null;
    for (const c of candidates) {
      const plat = Number(c.lat as any);
      const plon = Number(c.lng as any);
      if (isNaN(plat) || isNaN(plon)) continue;
      const d = IngestionDedupService.haversineMeters({ lat, lon }, { lat: plat, lon: plon });
      if (d > this.geoRadiusMeters) continue;
      if (normName) {
        const cname = this.normalizeStr(c.name ?? "");
        // require same normalized name for stronger match; else still allow by distance if no name provided
        if (cname && cname !== normName) {
          // mismatch name — de-prioritize by adding 20% to distance
          const penalized = d * 1.2;
          if (!best || penalized < best.d) best = { id: c.id, d: penalized };
          continue;
        }
      }
      if (!best || d < best.d) best = { id: c.id, d };
    }
    return best;
  }
}

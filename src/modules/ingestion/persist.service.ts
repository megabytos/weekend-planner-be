import type { PrismaClient } from "@prisma/client";
import type { SourceType } from "../search/search.schemas.js";
// Import types only to avoid creating local value bindings that trigger TS2459
import type { IngestionDedupService, NormalizedEventLike, NormalizedPlaceLike } from "./dedup.service.js";
import { computeChecksum } from "./merge.service.js";
import type { IngestionMergeService } from "./merge.service.js";
import { IngestionScoringService } from "./scoring.service.js";
import { DEDUP_RADIUS_METERS_DEFAULT } from "../../config/providers.js";
import { IngestLogger } from "./ingest.logger.js";
import { resolveExpectedDurationForEvent as resolveEventDurationShared } from "../catalog/taxonomy/duration.js";

// Re-export types used by tests to avoid deep imports
export type { IngestionDedupService, NormalizedEventLike, NormalizedPlaceLike } from "./dedup.service.js";
export type { IngestionMergeService } from "./merge.service.js";

export type IngestStats = {
  total: number;
  created: number; // created new source link or canonical
  updated: number; // updated canonical entity
  unchanged: number;
  errors: number;
  warnings: string[];
};

export class IngestionPersistService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly dedup: IngestionDedupService,
    private readonly merge: IngestionMergeService,
    private readonly scoring: IngestionScoringService = new IngestionScoringService(),
    private readonly logger?: IngestLogger,
  ) {}

  // expected duration for events — shared helper keeps parity with search

  // Simple Haversine distance in meters
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

  private async findNearestPlaceId(lat: number, lon: number, radiusMeters = DEDUP_RADIUS_METERS_DEFAULT): Promise<string | null> {
    // Rough bounding box to limit candidates
    const km = radiusMeters / 1000;
    const degLat = km / 111.32; // ~ km per degree latitude
    const degLon = km / (111.32 * Math.cos((lat * Math.PI) / 180) || 1);
    const minLat = lat - degLat;
    const maxLat = lat + degLat;
    const minLon = lon - degLon;
    const maxLon = lon + degLon;

    const candidates = await this.prisma.place.findMany({
      where: {
        isActive: true,
        moderation: 'APPROVED' as any,
        lat: { gte: minLat as any, lte: maxLat as any },
        lng: { gte: minLon as any, lte: maxLon as any },
      },
      select: { id: true, lat: true, lng: true },
      take: 20,
    });
    let best: { id: string; d: number } | null = null;
    for (const c of candidates) {
      const plat = Number(c.lat as any);
      const plon = Number(c.lng as any);
      if (isNaN(plat) || isNaN(plon)) continue;
      const d = IngestionPersistService.haversineMeters({ lat, lon }, { lat: plat, lon: plon });
      if (d <= radiusMeters && (!best || d < best.d)) best = { id: c.id, d };
    }
    return best?.id ?? null;
  }

  async ingestPlaces(provider: SourceType, items: NormalizedPlaceLike[]): Promise<IngestStats> {
    const stats: IngestStats = { total: items.length, created: 0, updated: 0, unchanged: 0, errors: 0, warnings: [] };
    this.logger?.log(`persist.ingestPlaces start src=${provider} total=${items.length}`);
    let withCategories = 0;
    for (const it of items) {
      try {
        const checksum = computeChecksum(it);

        // Dedup/match
        const match = await this.dedup.matchOrCreatePlace(it);

        // Fetch existing minimal fields
        const existing = await this.prisma.place.findUnique({ where: { id: match.id }, select: { id: true, name: true, address: true, url: true, imageUrl: true, lat: true, lng: true, mainCategoryId: true, popularityScore: true, qualityScore: true, freshnessScore: true, providerCategories: true, provider: true } });
        if (!existing) {
          stats.errors++;
          stats.warnings.push(`Place not found after match: ${match.id}`);
          this.logger?.log(`persist.place warn: not found after match id=${match.id}`);
          continue;
        }

        // Build canonical update
        const update = this.merge.buildPlaceUpdate(
          { name: existing.name, address: existing.address, imageUrl: existing.imageUrl, url: existing.url },
          it,
          provider,
          it.sourceUpdatedAt ? new Date(it.sourceUpdatedAt) : null
        );

        // Deterministic scoring by canonical id (no boost for places)
        const scores = this.scoring.scoreByCanonicalId(existing.id);
        const scoreUpdate: any = {};
        if (existing.popularityScore == null || existing.popularityScore !== scores.popularityScore) {
          scoreUpdate.popularityScore = scores.popularityScore;
        }
        if (existing.qualityScore == null || existing.qualityScore !== scores.qualityScore) {
          scoreUpdate.qualityScore = scores.qualityScore;
        }
        if (existing.freshnessScore == null || existing.freshnessScore !== scores.freshnessScore) {
          scoreUpdate.freshnessScore = scores.freshnessScore;
        }

        // Provider raw categories (comma-separated audit field)
        const rawCats = Array.isArray(it.providerCategoriesRaw) ? it.providerCategoriesRaw : [];
        const normCats = Array.from(
          new Set(
            rawCats
              .map((s) => (typeof s === 'string' ? s.trim() : ''))
              .filter((s) => s.length > 0)
          )
        );
        const existingProvCats = (existing.providerCategories || '')
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        let providerCategoriesUpdate: string | undefined;
        if (normCats.length) {
          // union with existing
          const union = Array.from(new Set([...existingProvCats, ...normCats]));
          const unionStr = union.join(', ');
          if ((existing.providerCategories || '') !== unionStr) {
            providerCategoriesUpdate = unionStr;
          }
        }

        const providerUpdate = existing.provider == null ? { provider: provider as any } : {};
        const combinedUpdate = { ...(update ?? {}), ...scoreUpdate, ...providerUpdate, ...(providerCategoriesUpdate ? { providerCategories: providerCategoriesUpdate } : {}) } as any;

        if (combinedUpdate && Object.keys(combinedUpdate).length) {
          await this.prisma.place.update({ where: { id: existing.id }, data: combinedUpdate });
          stats.updated++;
        }

        // Categories union + primary category (only if missing)
        if (Array.isArray(it.categories) && it.categories.length) {
          withCategories++;
          try {
            const updatedCats = await this.upsertPlaceCategories(existing.id, it.categories, !!existing.mainCategoryId);
            if (updatedCats.changed) stats.updated++;
          } catch (e: any) {
            stats.warnings.push(`place categories warning: ${e?.message || String(e)}`);
          }
        }

        // Upsert PlaceSource
        const sourceKey = { source_externalId: { source: it.source.source, externalId: it.source.externalId } } as const;
        const existingSource = await this.prisma.placeSource.findUnique({ where: sourceKey });
        await this.prisma.placeSource.upsert({
          where: sourceKey,
          create: {
            placeId: match.id,
            source: it.source.source as any,
            externalId: it.source.externalId,
            url: it.source.url ?? null,
            payload: { snapshot: it },
            checksum,
            fetchedAt: new Date(),
            sourceUpdatedAt: it.sourceUpdatedAt ? new Date(it.sourceUpdatedAt) : null,
          },
          update: {
            placeId: match.id,
            url: it.source.url ?? null,
            payload: { snapshot: it },
            checksum,
            fetchedAt: new Date(),
            sourceUpdatedAt: it.sourceUpdatedAt ? new Date(it.sourceUpdatedAt) : null,
          },
        });

        if (!combinedUpdate || Object.keys(combinedUpdate).length === 0) {
          if (existingSource) stats.unchanged++; else stats.created++;
        } else {
          if (!existingSource) stats.created++; // count new source link as created as well
        }
      } catch (e: any) {
        stats.errors++;
        stats.warnings.push(`place error: ${e?.message || String(e)}`);
        this.logger?.log(`persist.place error: ${e?.message || String(e)}`);
      }
    }
    this.logger?.log(`persist.ingestPlaces end src=${provider} {total:${stats.total}, created:${stats.created}, updated:${stats.updated}, unchanged:${stats.unchanged}, errors:${stats.errors}, withCategories:${withCategories}}`);
    return stats;
  }

  async ingestEvents(provider: SourceType, items: NormalizedEventLike[]): Promise<IngestStats> {
    const stats: IngestStats = { total: items.length, created: 0, updated: 0, unchanged: 0, errors: 0, warnings: [] };
    this.logger?.log(`persist.ingestEvents start src=${provider} total=${items.length}`);
    let withCategories = 0;
    for (const it of items) {
      try {
        const checksum = computeChecksum(it);

        const match = await this.dedup.matchOrCreateEvent(it);

        const existing = await this.prisma.event.findUnique({ where: { id: match.id }, select: { id: true, title: true, description: true, imageUrl: true, mainCategoryId: true, popularityScore: true, qualityScore: true, freshnessScore: true, providerCategories: true, provider: true,
          priceFrom: true, priceTo: true, currency: true, isOnline: true, ageLimit: true, languages: true, ticketsUrl: true } });
        if (!existing) {
          stats.errors++;
          stats.warnings.push(`Event not found after match: ${match.id}`);
          this.logger?.log(`persist.event warn: not found after match id=${match.id}`);
          continue;
        }

        const update = this.merge.buildEventUpdate(
          { title: existing.title, description: existing.description, imageUrl: existing.imageUrl },
          it,
          provider,
          it.sourceUpdatedAt ? new Date(it.sourceUpdatedAt) : null
        );

        // Deterministic scoring by canonical id + optional boost for events to improve visibility on first page
        const scores = this.scoring.scoreByCanonicalId(existing.id);
        const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
        const qualityBoost = Number(process.env.INGEST_EVENT_QUALITY_BOOST ?? '0.08');
        const boosted = {
          popularityScore: scores.popularityScore,
          qualityScore: clamp01(scores.qualityScore + (isNaN(qualityBoost) ? 0 : qualityBoost)),
          freshnessScore: scores.freshnessScore,
        };
        const scoreUpdate: any = {};
        if (existing.popularityScore == null || existing.popularityScore !== boosted.popularityScore) {
          scoreUpdate.popularityScore = boosted.popularityScore;
        }
        if (existing.qualityScore == null || existing.qualityScore !== boosted.qualityScore) {
          scoreUpdate.qualityScore = boosted.qualityScore;
        }
        if (existing.freshnessScore == null || existing.freshnessScore !== boosted.freshnessScore) {
          scoreUpdate.freshnessScore = boosted.freshnessScore;
        }

        // Provider raw categories (comma-separated audit field)
        const rawCats = Array.isArray(it.providerCategoriesRaw) ? it.providerCategoriesRaw : [];
        const normCats = Array.from(
          new Set(
            rawCats
              .map((s) => (typeof s === 'string' ? s.trim() : ''))
              .filter((s) => s.length > 0)
          )
        );
        const existingProvCats = (existing.providerCategories || '')
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        let providerCategoriesUpdate: string | undefined;
        if (normCats.length) {
          const union = Array.from(new Set([...existingProvCats, ...normCats]));
          const unionStr = union.join(', ');
          if ((existing.providerCategories || '') !== unionStr) {
            providerCategoriesUpdate = unionStr;
          }
        }

        const providerUpdate = existing.provider == null ? { provider: provider as any } : {};
        // Extended event fields: set only if incoming has a value and differs; avoid overwriting with empties
        const ext: any = {};
        if (it.priceFrom != null && (existing.priceFrom == null || existing.priceFrom !== it.priceFrom)) ext.priceFrom = it.priceFrom;
        if (it.priceTo != null && (existing.priceTo == null || existing.priceTo !== it.priceTo)) ext.priceTo = it.priceTo;
        if (it.currency && it.currency.length && (existing.currency == null || existing.currency !== it.currency)) ext.currency = it.currency;
        if (typeof it.isOnline === 'boolean' && (existing.isOnline == null || existing.isOnline !== it.isOnline)) ext.isOnline = it.isOnline;
        if (typeof it.ageLimit === 'number' && (existing.ageLimit == null || existing.ageLimit !== it.ageLimit)) ext.ageLimit = it.ageLimit;
        if (Array.isArray(it.languages) && it.languages.length) {
          const incoming = it.languages.map(String);
          const existingLangs = Array.isArray(existing.languages) ? existing.languages : [];
          const same = incoming.length === existingLangs.length && incoming.every((x, i) => x === existingLangs[i]);
          if (!same) ext.languages = incoming as any;
        }
        if (it.ticketsUrl && it.ticketsUrl.length && (existing.ticketsUrl == null || existing.ticketsUrl !== it.ticketsUrl)) ext.ticketsUrl = it.ticketsUrl;

        const combinedUpdate = { ...(update ?? {}), ...scoreUpdate, ...providerUpdate, ...(providerCategoriesUpdate ? { providerCategories: providerCategoriesUpdate } : {}), ...ext } as any;

        if (combinedUpdate && Object.keys(combinedUpdate).length) {
          await this.prisma.event.update({ where: { id: existing.id }, data: combinedUpdate });
          stats.updated++;
        }

        // Categories union + primary category (only if missing)
        if (Array.isArray(it.categories) && it.categories.length) {
          withCategories++;
          try {
            const updatedCats = await this.upsertEventCategories(existing.id, it.categories, !!existing.mainCategoryId);
            if (updatedCats.changed) stats.updated++;
          } catch (e: any) {
            stats.warnings.push(`event categories warning: ${e?.message || String(e)}`);
          }
        }

        // Upsert (idempotent) EventOccurrence based on time.start; link to nearest Place if possible
        if (it.time && it.time.start) {
          const start = new Date(it.time.start);
          // derive effective end time:
          let effectiveEnd: Date | null = null;
          let endFromProvider = false;
          if (it.time.end) {
            const parsed = new Date(it.time.end);
            if (!isNaN(parsed.getTime()) && parsed.getTime() > start.getTime()) {
              effectiveEnd = parsed;
              endFromProvider = true;
            }
          }
          if (!effectiveEnd) {
            // synthesize by expected duration from primary category slug (shared helper with random fallback)
            const primarySlug = Array.isArray(it.categories) && it.categories.length ? it.categories[0] : undefined;
            const minutes = resolveEventDurationShared(primarySlug);
            effectiveEnd = new Date(start.getTime() + minutes * 60 * 1000);
            this.logger?.log(`persist.event occurrence: synthesized end by category=${primarySlug ?? 'event.other'} minutes=${minutes}`);
          } else {
            this.logger?.log(`persist.event occurrence: using provider end`);
          }
          // try find existing by exact startTime
          const existingOcc = await this.prisma.eventOccurrence.findFirst({
            where: { eventId: existing.id, startTime: start },
            select: { id: true, endTime: true },
          });

          // Base occurrence update data
          const occData: any = {
            timezone: it.time.timezone ?? null,
            url: it.url ?? null,
          };
          // Idempotency: if end is from provider — always set; if synthesized — set only when current endTime is null
          if (endFromProvider) {
            occData.endTime = effectiveEnd;
          } else if (!existingOcc || existingOcc.endTime == null) {
            occData.endTime = effectiveEnd;
          }
          if (it.location && it.location.lat != null && it.location.lon != null) {
            occData.lat = it.location.lat;
            occData.lng = it.location.lon;
            // try to link to nearest Place within configured radius
            try {
              const placeId = await this.findNearestPlaceId(it.location.lat, it.location.lon);
              if (placeId) occData.placeId = placeId;
            } catch {
              // ignore linking errors for MVP
            }
          }

          if (existingOcc) {
            await this.prisma.eventOccurrence.update({ where: { id: existingOcc.id }, data: occData });
          } else {
            await this.prisma.eventOccurrence.create({
              data: {
                eventId: existing.id,
                startTime: start,
                ...occData,
              },
            });
          }
        }

        const sourceKey = { source_externalId: { source: it.source.source, externalId: it.source.externalId } } as const;
        const existingSource = await this.prisma.eventSource.findUnique({ where: sourceKey });
        await this.prisma.eventSource.upsert({
          where: sourceKey,
          create: {
            eventId: match.id,
            source: it.source.source as any,
            externalId: it.source.externalId,
            url: it.source.url ?? null,
            payload: { snapshot: it },
            checksum,
            fetchedAt: new Date(),
            sourceUpdatedAt: it.sourceUpdatedAt ? new Date(it.sourceUpdatedAt) : null,
          },
          update: {
            eventId: match.id,
            url: it.source.url ?? null,
            payload: { snapshot: it },
            checksum,
            fetchedAt: new Date(),
            sourceUpdatedAt: it.sourceUpdatedAt ? new Date(it.sourceUpdatedAt) : null,
          },
        });

        if (!combinedUpdate || Object.keys(combinedUpdate).length === 0) {
          if (existingSource) stats.unchanged++; else stats.created++;
        } else {
          if (!existingSource) stats.created++;
        }
      } catch (e: any) {
        stats.errors++;
        stats.warnings.push(`event error: ${e?.message || String(e)}`);
        this.logger?.log(`persist.event error: ${e?.message || String(e)}`);
      }
    }
    this.logger?.log(`persist.ingestEvents end src=${provider} {total:${stats.total}, created:${stats.created}, updated:${stats.updated}, unchanged:${stats.unchanged}, errors:${stats.errors}, withCategories:${withCategories}}`);
    return stats;
  }

  // ---------- Category helpers ----------
  private async upsertPlaceCategories(placeId: string, slugs: readonly string[], hasPrimaryAlready: boolean): Promise<{ changed: boolean }> {
    const uniq = Array.from(new Set(slugs.filter(Boolean)));
    if (!uniq.length) return { changed: false };
    // In DB the field is `key` (not `slug`) – map incoming slugs to keys
    const cats = await this.prisma.placeCategory.findMany({ where: { key: { in: uniq as any } }, select: { id: true } });
    if (!cats.length) return { changed: false };

    const existingLinks = await this.prisma.placeToCategory.findMany({ where: { placeId }, select: { categoryId: true, isPrimary: true } });
    const existingSet = new Set(existingLinks.map((l) => l.categoryId));
    let changed = false;
    for (const c of cats) {
      if (!existingSet.has(c.id)) {
        await this.prisma.placeToCategory.create({ data: { placeId, categoryId: c.id, isPrimary: false } });
        changed = true;
      }
    }

    // Ensure primary if none exists yet
    const hasPrimary = hasPrimaryAlready || existingLinks.some((l) => l.isPrimary);
    if (!hasPrimary) {
      const primaryCat = cats[0];
      await this.prisma.$transaction([
        this.prisma.place.update({ where: { id: placeId }, data: { mainCategoryId: primaryCat.id } }),
        this.prisma.placeToCategory.upsert({
          where: { placeId_categoryId: { placeId, categoryId: primaryCat.id } },
          update: { isPrimary: true },
          create: { placeId, categoryId: primaryCat.id, isPrimary: true },
        }),
      ] as any);
      changed = true;
    }
    return { changed };
  }

  private async upsertEventCategories(eventId: string, slugs: readonly string[], hasPrimaryAlready: boolean): Promise<{ changed: boolean }> {
    const uniq = Array.from(new Set(slugs.filter(Boolean)));
    if (!uniq.length) return { changed: false };
    // In DB the field is `key` (not `slug`) – map incoming slugs to keys
    const cats = await this.prisma.eventCategory.findMany({ where: { key: { in: uniq as any } }, select: { id: true } });
    if (!cats.length) return { changed: false };

    const existingLinks = await this.prisma.eventToCategory.findMany({ where: { eventId }, select: { categoryId: true, isPrimary: true } });
    const existingSet = new Set(existingLinks.map((l) => l.categoryId));
    let changed = false;
    for (const c of cats) {
      if (!existingSet.has(c.id)) {
        await this.prisma.eventToCategory.create({ data: { eventId, categoryId: c.id, isPrimary: false } });
        changed = true;
      }
    }

    const hasPrimary = hasPrimaryAlready || existingLinks.some((l) => l.isPrimary);
    if (!hasPrimary) {
      const primaryCat = cats[0];
      await this.prisma.$transaction([
        this.prisma.event.update({ where: { id: eventId }, data: { mainCategoryId: primaryCat.id } }),
        this.prisma.eventToCategory.upsert({
          where: { eventId_categoryId: { eventId, categoryId: primaryCat.id } },
          update: { isPrimary: true },
          create: { eventId, categoryId: primaryCat.id, isPrimary: true },
        }),
      ] as any);
      changed = true;
    }
    return { changed };
  }
}

import { z } from 'zod';

export const SourceTypeEnum = z.enum(['TICKETMASTER', 'PREDICTHQ', 'GEOAPIFY', 'GOOGLE_PLACES', 'FOURSQUARE', 'MANUAL']);
export type SourceType = z.infer<typeof SourceTypeEnum>;

export const BoundingBoxSchema = z
  .object({
    south: z.number().min(-90).max(90),
    west: z.number().min(-180).max(180),
    north: z.number().min(-90).max(90),
    east: z.number().min(-180).max(180),
  })
  .refine((b) => b.north >= b.south && ((b.east - b.west + 360) % 360) >= 0, { message: 'Invalid bounding box' });

export const whereSchema = z
  .object({
    city: z
      .object({
        id: z.number(),
        code: z.string().min(2).optional(),
        name: z.string().optional(),
        countryCode: z.string().length(2).optional(),
      })
      .optional(),
    geo: z
      .object({
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
        radiusKm: z.number().min(0.5).max(50).default(5),
      })
      .optional(),
    bbox: BoundingBoxSchema.optional(),
  })
  .refine((v) => !!v.city || !!v.geo || !!v.bbox, { message: 'Either city, geo or bbox must be provided' });

export type WhereInput = z.infer<typeof whereSchema>;

export const whenPresetEnum = z.enum(['now', 'today_evening', 'tonight', 'tomorrow', 'this_weekend']);
export const whenPresetSchema = z.object({ type: z.literal('preset'), preset: whenPresetEnum });
export const whenRangeSchema = z.object({ type: z.literal('range'), from: z.iso.datetime(), to: z.iso.datetime() });
export const whenSchema = z.union([whenPresetSchema, whenRangeSchema]);
export type WhenInput = z.infer<typeof whenSchema>;

export const companyTypeEnum = z.enum(['kids', 'couple', 'solo', 'friends', 'coworkers']);
export const kidsAgeGroupEnum = z.enum(['0-3', '4-7', '8-12', '13-16']);
export const whoSchema = z.object({ companyType: companyTypeEnum.optional(), kidsAgeGroups: z.array(kidsAgeGroupEnum).optional() });
export type WhoInput = z.infer<typeof whoSchema>;

export const timeBudgetEnum = z.enum(['UP_TO_2_HOURS', 'HALF_DAY', 'FULL_DAY', 'EVENING']);
export type TimeBudget = z.infer<typeof timeBudgetEnum>;

export const budgetTierEnum = z.enum(['FREE', 'CHEAP', 'MODERATE', 'EXPENSIVE', 'ANY']);
export const budgetSchema = z.object({
  tier: budgetTierEnum.optional(),
  currency: z.string().length(3).optional(),
  priceRange: z.object({ min: z.number().min(0).nullable().optional(), max: z.number().min(0).nullable().optional() }).optional(),
});
export type BudgetInput = z.infer<typeof budgetSchema>;

export const moodEnum = z.enum(['CALM', 'ACTIVE', 'ROMANTIC', 'ANY']);
export type Mood = z.infer<typeof moodEnum>;

export const targetEnum = z.enum(['places', 'events', 'both']);
export type SearchTarget = z.infer<typeof targetEnum>;

export const transportEnum = z.enum(['WALK', 'PUBLIC', 'CAR', 'BIKE']);
export type TransportMode = z.infer<typeof transportEnum>;

export const indoorOutdoorEnum = z.enum(['indoor', 'outdoor', 'any']);
export type IndoorOutdoor = z.infer<typeof indoorOutdoorEnum>;

export const extraFiltersSchema = z.object({
  categorySlugs: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  transport: transportEnum.optional(),
  indoorOutdoor: indoorOutdoorEnum.optional(),
  openNowOnly: z.boolean().optional(),
  sources: z.array(SourceTypeEnum).optional(),
});
export type ExtraFiltersInput = z.infer<typeof extraFiltersSchema>;

export const paginationSchema = z.object({ limit: z.number().int().min(1).max(100).default(20), offset: z.number().int().min(0).default(0), page: z.number() });
export type PaginationInput = z.infer<typeof paginationSchema>;

export const sortEnum = z.enum(['rank', 'distance', 'start_time', 'price_asc', 'price_desc', 'rating']);
export type SearchSort = z.infer<typeof sortEnum>;

export const searchRequestSchema = z.object({
  q: z.string().trim().min(1).optional(),
  where: whereSchema,
  when: whenSchema.optional(),
  who: whoSchema.optional(),
  timeBudget: timeBudgetEnum.optional(),
  budget: budgetSchema.optional(),
  mood: moodEnum.optional(),
  target: targetEnum.default('both'),
  filters: extraFiltersSchema.optional(),
  pagination: paginationSchema.default({ limit: 100, offset: 0, page: 1 }),
  sort: sortEnum.default('rank'),
});
export type SearchRequest = z.infer<typeof searchRequestSchema>;

export const citySummarySchema = z.object({ id: z.string(), code: z.string(), name: z.string(), countryCode: z.string().length(2) });
export type CitySummary = z.infer<typeof citySummarySchema>;

export const categorySummarySchema = z.object({ slug: z.string(), type: z.enum(['PLACE', 'EVENT', 'TAG']), name: z.string().optional() });
export type CategorySummary = z.infer<typeof categorySummarySchema>;

export const coordinatesSchema = z.object({ lat: z.number(), lon: z.number() });
export type Coordinates = z.infer<typeof coordinatesSchema>;

export const openingHoursSchema = z.object({
  timezone: z.string(),
  periods: z.array(z.object({ weekday: z.number().int().min(0).max(6), open: z.string(), close: z.string() })),
});

export const SourceRefSchema = z.object({ source: SourceTypeEnum, externalId: z.string(), url: z.string().url().optional() });

export const searchHitBaseSchema = z.object({
  id: z.string(),
  type: z.enum(['place', 'event']),
  title: z.string(),
  description: z.string().nullable().optional(),
  city: citySummarySchema.nullable(),
  primaryCategory: categorySummarySchema.nullable(),
  categories: z.array(categorySummarySchema).optional(),
  cardType: z.string().optional(),
  address: z.string().optional(),
  location: coordinatesSchema.nullable(),
  distanceKm: z.number().nonnegative().optional(),
  indoorOutdoor: indoorOutdoorEnum.optional(),
  priceTier: budgetTierEnum.transform((tier) => (tier === 'ANY' ? null : tier)).nullable().optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  reviewCount: z.number().int().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  photos: z.array(z.string().url()).optional(),
  sourceType: z.enum(['API', 'PARTNER', 'MANUAL', 'INTERNAL']),
  sources: z.array(SourceRefSchema).optional(),
  url: z.string().url().optional(),
  scores: z.object({
      rank: z.number().optional(),
      popularity: z.number().optional(),
      quality: z.number().optional(),
      distance: z.number().optional(),
      profileMatch: z.number().optional() }).optional(),
});

export const placeHitSchema = searchHitBaseSchema.extend({
  type: z.literal('place'),
  openingHours: openingHoursSchema.nullable().optional(),
  openNow: z.boolean().optional(),
  openUntil: z.string().optional(),
    categoryMeta: z.record(z.string(), z.any()).optional(),
});

export const eventOccurrenceSummarySchema = z.object({
  id: z.string(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().nullable().optional(),
  timezone: z.string().optional(),
  weekday: z.number().int().min(0).max(6).optional(),
  location: coordinatesSchema.nullable(),
  place: z.object({ id: z.string().uuid(), name: z.string().optional() }).nullable(),
});

export const eventHitSchema = searchHitBaseSchema.extend({
  type: z.literal('event'),
  isOnline: z.boolean().optional(),
  nextOccurrence: eventOccurrenceSummarySchema.nullable(),
  occurrences: z
    .array(z.object({ start: z.string(), end: z.string().optional(), location: coordinatesSchema.optional(), venueId: z.string().optional(), timezone: z.string().optional(), url: z.string().url().optional() }))
    .optional(),
  priceFrom: z.number().min(0).nullable().optional(),
  priceTo: z.number().min(0).nullable().optional(),
  currency: z.string().length(3).optional(),
  isFree: z.boolean().optional(),
  languages: z.array(z.string()).optional(),
  ageLimit: z.number().int().optional(),
  indoorOutdoor: indoorOutdoorEnum.optional(),
  ticketsUrl: z.string().url().optional(),
  categoryMeta: z.record(z.string(), z.any()).optional(),
});

export const searchHitSchema = z.union([placeHitSchema, eventHitSchema]);

export const FacetBucketSchema = z.object({ key: z.string(), count: z.number().int().nonnegative() });
export const FacetsSchema = z.object({ categories: z.array(FacetBucketSchema).optional(), priceTier: z.array(FacetBucketSchema).optional() }).optional();

export const searchMetaSchema = z.object({
  target: targetEnum,
  totalPlaces: z.number().int().nonnegative().optional(),
  totalEvents: z.number().int().nonnegative().optional(),
  effectiveFilters: z.object({ when: whenSchema.optional(), budget: budgetSchema.optional(), mood: moodEnum.optional(), transport: transportEnum.optional() }).optional(),
});

export const searchResponseSchema = z.object({
  queryId: z.string(),
  total: z.number().int().nonnegative(),
  pagination: paginationSchema,
  tookMs: z.number().int().nonnegative().optional(),
  warnings: z.array(z.string()).optional(),
  meta: searchMetaSchema.optional(),
  bbox: BoundingBoxSchema.optional(),
  facets: FacetsSchema,
  items: z.array(searchHitSchema),
});

export type SearchResponse = z.infer<typeof searchResponseSchema>;

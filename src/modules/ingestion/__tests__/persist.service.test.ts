import { IngestionPersistService } from '../persist.service.js';
import type { IngestionDedupService as IDedup, IngestionMergeService as IMerge } from '../persist.service.js';

// Helper: fixed scoring mock to control idempotency
const scoringMock = {
  scoreByCanonicalId: (_id: string) => ({ popularityScore: 0.5, qualityScore: 0.6, freshnessScore: 0.7 }),
};

function makePrismaMock(overrides: Partial<any> = {}) {
  const base = {
    event: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'E1', title: null, description: null, imageUrl: null, mainCategoryId: null,
        popularityScore: 0.5, qualityScore: 0.6, freshnessScore: 0.7,
        providerCategories: null, provider: null,
        priceFrom: null, priceTo: null, currency: null, isOnline: null, ageLimit: null, languages: [], ticketsUrl: null,
      }),
      update: jest.fn(),
    },
    eventOccurrence: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'EO1' }),
      update: jest.fn(),
    },
    eventSource: {
      findUnique: jest.fn().mockResolvedValue({ id: 'ES1' }), // emulate existing source to count as unchanged
      upsert: jest.fn(),
    },
    place: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { ...base, ...overrides } as any;
}

function makeDedupMock() {
  return {
    matchOrCreateEvent: jest.fn().mockResolvedValue({ targetType: 'event', id: 'E1', reason: { type: 'SOURCE' } }),
  } as unknown as IDedup;
}

function makeMergeMock() {
  return {
    buildEventUpdate: jest.fn().mockReturnValue(null),
  } as unknown as IMerge;
}

describe('IngestionPersistService.ingestEvents', () => {
  it('counts unchanged when no canonical update and source exists', async () => {
    const prevBoost = process.env.INGEST_EVENT_QUALITY_BOOST;
    process.env.INGEST_EVENT_QUALITY_BOOST = '0';
    const prisma = makePrismaMock({
      event: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'E1', title: null, description: null, imageUrl: null, mainCategoryId: null,
          popularityScore: 0.5, qualityScore: 0.6, freshnessScore: 0.7,
          providerCategories: null, provider: 'TICKETMASTER',
          priceFrom: null, priceTo: null, currency: null, isOnline: null, ageLimit: null, languages: [], ticketsUrl: null,
        }),
        update: jest.fn(),
      },
      // emulate that existing EventSource has same checksum as would be computed now
      eventSource: {
        findUnique: jest.fn().mockResolvedValue({ id: 'ES1', checksum: 'SAME' }),
        upsert: jest.fn(),
      },
    });
    const dedup = makeDedupMock();
    const merge = makeMergeMock();
    const svc = new IngestionPersistService(prisma as any, dedup as any, merge as any, scoringMock as any);

    const stats = await svc.ingestEvents('TICKETMASTER', [{
      title: 'T', cityId: '40', time: null, categories: [], providerCategoriesRaw: [],
      source: { source: 'TICKETMASTER', externalId: 'ext-1' },
    } as any]);

    expect(stats.total).toBe(1);
    expect(stats.unchanged).toBe(1);
    expect(stats.updated).toBe(0);
    expect(stats.created).toBe(0);
    process.env.INGEST_EVENT_QUALITY_BOOST = prevBoost;
  });

  it('synthesizes endTime by category when provider end is missing', async () => {
    const prisma = makePrismaMock({
      eventSource: { findUnique: jest.fn().mockResolvedValue(null) }, // to avoid counting as unchanged
    });
    const dedup = makeDedupMock();
    const merge = makeMergeMock();
    const svc = new IngestionPersistService(prisma as any, dedup as any, merge as any, scoringMock as any);

    const start = new Date('2025-01-01T10:00:00Z');
    const stats = await svc.ingestEvents('TICKETMASTER', [{
      title: 'T', cityId: '40',
      time: { start: start.toISOString(), end: undefined, timezone: 'Europe/London' },
      categories: ['event.theatre_performing_arts'], // expectedDuration 150
      providerCategoriesRaw: [],
      source: { source: 'TICKETMASTER', externalId: 'ext-2' },
    } as any]);

    expect(stats.total).toBe(1);
    // endTime should be start + 150 minutes
    const createCalls = (prisma.eventOccurrence.create as jest.Mock).mock.calls;
    expect(createCalls.length).toBe(1);
    const data = createCalls[0][0].data;
    const expectedEnd = new Date(start.getTime() + 150 * 60 * 1000).toISOString();
    expect(new Date(data.endTime).toISOString()).toBe(expectedEnd);
  });

  it('idempotent: second identical ingest counted as unchanged', async () => {
    const prevBoost = process.env.INGEST_EVENT_QUALITY_BOOST;
    process.env.INGEST_EVENT_QUALITY_BOOST = '0';
    const prisma = makePrismaMock({
      event: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'E1', title: null, description: null, imageUrl: null, mainCategoryId: null,
          popularityScore: 0.5, qualityScore: 0.6, freshnessScore: 0.7,
          providerCategories: null, provider: 'TICKETMASTER',
          priceFrom: null, priceTo: null, currency: null, isOnline: null, ageLimit: null, languages: [], ticketsUrl: null,
        }),
        update: jest.fn(),
      },
      eventSource: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
    });
    const dedup = makeDedupMock();
    const merge = makeMergeMock();
    const svc = new IngestionPersistService(prisma as any, dedup as any, merge as any, scoringMock as any);
    const item: any = { title: 'Same', cityId: '40', time: null, categories: [], providerCategoriesRaw: [], source: { source: 'TICKETMASTER', externalId: 'x' } };
    const first = await svc.ingestEvents('TICKETMASTER', [item]);
    // emulate that source now exists for the second run with the same checksum
    (prisma.eventSource.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'ESX', checksum: 'SAME' });
    const second = await svc.ingestEvents('TICKETMASTER', [item]);
    expect(first.total).toBe(1);
    expect(second.total).toBe(1);
    expect(second.unchanged).toBe(1);
    process.env.INGEST_EVENT_QUALITY_BOOST = prevBoost;
  });

  it('uses provider end when present (always writes endTime on update)', async () => {
    const prisma = makePrismaMock({
      eventOccurrence: {
        findFirst: jest.fn().mockResolvedValue({ id: 'EO2', endTime: new Date('2025-01-01T11:00:00Z') }),
        create: jest.fn(),
        update: jest.fn(),
      },
      eventSource: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
    });
    const svc = new IngestionPersistService(prisma as any, makeDedupMock() as any, makeMergeMock() as any, scoringMock as any);
    const start = new Date('2025-01-01T10:00:00Z');
    const end = new Date('2025-01-01T12:00:00Z');
    const stats = await svc.ingestEvents('TICKETMASTER', [{
      title: 'With end', cityId: '40', time: { start: start.toISOString(), end: end.toISOString(), timezone: 'UTC' }, categories: [], providerCategoriesRaw: [], source: { source: 'TICKETMASTER', externalId: 'z' },
    } as any]);
    expect(stats.total).toBe(1);
    const updateCalls = (prisma.eventOccurrence.update as jest.Mock).mock.calls;
    expect(updateCalls.length).toBe(1);
    const data = updateCalls[0][0].data;
    expect(new Date(data.endTime).toISOString()).toBe(end.toISOString());
  });

  it('links occurrence to nearest place when coordinates present', async () => {
    const prisma = makePrismaMock({
      place: {
        findMany: jest.fn().mockResolvedValue([{ id: 'P-near', lat: 50.1001, lng: 8.6001 }]),
      },
      eventOccurrence: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'EO3' }),
        update: jest.fn(),
      },
      eventSource: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
    });
    const svc = new IngestionPersistService(prisma as any, makeDedupMock() as any, makeMergeMock() as any, scoringMock as any);
    await svc.ingestEvents('TICKETMASTER', [{
      title: 'At coords', cityId: '40', time: { start: '2025-01-01T00:00:00Z' }, location: { lat: 50.1, lon: 8.6 }, categories: [], providerCategoriesRaw: [], source: { source: 'TICKETMASTER', externalId: 'u' },
    } as any]);
    const createCalls = (prisma.eventOccurrence.create as jest.Mock).mock.calls;
    expect(createCalls.length).toBe(1);
    const occData = createCalls[0][0].data;
    expect(occData.placeId).toBe('P-near');
  });

  it('unions providerCategories without duplicates and updates event', async () => {
    const prisma = makePrismaMock({
      event: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'E1', title: null, description: null, imageUrl: null, mainCategoryId: null,
          popularityScore: 0.5, qualityScore: 0.6, freshnessScore: 0.7,
          providerCategories: 'A, B', provider: null,
          priceFrom: null, priceTo: null, currency: null, isOnline: null, ageLimit: null, languages: [], ticketsUrl: null,
        }),
        update: jest.fn(),
      },
      eventSource: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
    });
    const svc = new IngestionPersistService(prisma as any, makeDedupMock() as any, makeMergeMock() as any, scoringMock as any);
    await svc.ingestEvents('TICKETMASTER', [{
      title: 'Cats', cityId: '40', time: null, categories: [], providerCategoriesRaw: ['B', 'C'], source: { source: 'TICKETMASTER', externalId: 'pc' },
    } as any]);
    const updCalls = (prisma.event.update as jest.Mock).mock.calls;
    expect(updCalls.length).toBeGreaterThan(0);
    const data = updCalls[0][0].data;
    expect((data.providerCategories as string).includes('A')).toBe(true);
    expect((data.providerCategories as string).includes('B')).toBe(true);
    expect((data.providerCategories as string).includes('C')).toBe(true);
  });

  it('does not overwrite synthesized endTime when existing has end and provider has no end', async () => {
    const prisma = makePrismaMock({
      eventOccurrence: {
        findFirst: jest.fn().mockResolvedValue({ id: 'EO4', endTime: new Date('2025-01-01T11:00:00Z') }),
        create: jest.fn(),
        update: jest.fn(),
      },
      eventSource: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
    });
    const svc = new IngestionPersistService(prisma as any, makeDedupMock() as any, makeMergeMock() as any, scoringMock as any);
    const start = new Date('2025-01-01T10:00:00Z');
    await svc.ingestEvents('TICKETMASTER', [{
      title: 'No end from provider', cityId: '40', time: { start: start.toISOString(), end: undefined, timezone: 'UTC' }, categories: ['event.theatre_performing_arts'], providerCategoriesRaw: [], source: { source: 'TICKETMASTER', externalId: 'w' },
    } as any]);
    const updateCalls = (prisma.eventOccurrence.update as jest.Mock).mock.calls;
    expect(updateCalls.length).toBe(1);
    const data = updateCalls[0][0].data;
    expect(data.endTime).toBeUndefined(); // не перезаписываем существующий endTime при синтезе
  });
});

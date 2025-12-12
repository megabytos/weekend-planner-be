import { IngestionDedupService } from '../dedup.service.js';

// Minimal Prisma mock covering only used methods
function makePrismaMock(overrides: Partial<any> = {}) {
  const base = {
    placeSource: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    eventSource: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    place: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'place-new' }),
    },
    event: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'event-new' }),
    },
  };
  return { ...base, ...overrides } as any;
}

describe('IngestionDedupService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2025-01-01T00:00:00Z'));
  });

  it('matchOrCreatePlace: fast path by Source returns canonical id', async () => {
    const prisma = makePrismaMock({
      placeSource: {
        findUnique: jest.fn().mockResolvedValue({ placeId: 'place-123' }),
      },
    });
    const svc = new IngestionDedupService(prisma as any, 100);
    const res = await svc.matchOrCreatePlace({
      name: 'Test',
      location: { lat: 1, lon: 2 },
      cityId: '40',
      source: { source: 'GOOGLE_PLACES', externalId: 'abc' },
    });
    expect(res.id).toBe('place-123');
    expect(res.reason).toEqual({ type: 'SOURCE' });
    expect(prisma.place.create).not.toHaveBeenCalled();
  });

  it('matchOrCreatePlace: creates when no match and has coords+cityId', async () => {
    const prisma = makePrismaMock();
    const svc = new IngestionDedupService(prisma as any, 100);
    const res = await svc.matchOrCreatePlace({
      name: 'New Place',
      location: { lat: 50.1, lon: 8.6 },
      address: 'Addr',
      cityId: '40',
      source: { source: 'FOURSQUARE', externalId: 'fsq1' },
    });
    expect(res.id).toBe('place-new');
    expect(prisma.place.create).toHaveBeenCalled();
  });

  it('matchOrCreatePlace: throws without coordinates or cityId', async () => {
    const prisma = makePrismaMock();
    const svc = new IngestionDedupService(prisma as any, 100);
    await expect(
      svc.matchOrCreatePlace({ name: 'No coords', location: null as any, cityId: '40', source: { source: 'GEOAPIFY', externalId: 'x' } })
    ).rejects.toThrow(/coordinates/);
    await expect(
      svc.matchOrCreatePlace({ name: 'No city', location: { lat: 1, lon: 2 }, cityId: null as any, source: { source: 'GEOAPIFY', externalId: 'x' } })
    ).rejects.toThrow(/cityId/);
  });

  it('matchOrCreatePlace: GEO+NAME picks nearest within radius', async () => {
    const prisma = makePrismaMock({
      place: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'p1', name: 'Target', lat: 50.1005, lng: 8.6005 },
          { id: 'p2', name: 'Not so close', lat: 50.2, lng: 8.7 },
        ]),
        create: jest.fn(),
      },
    });
    const svc = new IngestionDedupService(prisma as any, 200); // 200m
    const res = await svc.matchOrCreatePlace({
      name: 'Target',
      location: { lat: 50.1, lon: 8.6 },
      cityId: '40',
      source: { source: 'GOOGLE_PLACES', externalId: 'abc2' },
    });
    expect(res.id).toBe('p1');
    expect(res.reason.type).toBe('GEO_NAME');
    expect(prisma.place.create).not.toHaveBeenCalled();
  });

  it('matchOrCreateEvent: fast path by Source returns canonical id', async () => {
    const prisma = makePrismaMock({
      eventSource: { findUnique: jest.fn().mockResolvedValue({ eventId: 'ev-1' }) },
    });
    const svc = new IngestionDedupService(prisma as any, 100);
    const res = await svc.matchOrCreateEvent({
      title: 'E',
      cityId: '40',
      source: { source: 'TICKETMASTER', externalId: 'tm1' },
    });
    expect(res.id).toBe('ev-1');
    expect(res.reason).toEqual({ type: 'SOURCE' });
  });

  it('matchOrCreateEvent: creates when no match and has cityId', async () => {
    const prisma = makePrismaMock();
    const svc = new IngestionDedupService(prisma as any, 100);
    const res = await svc.matchOrCreateEvent({
      title: 'New Event',
      cityId: '40',
      source: { source: 'PREDICTHQ', externalId: 'phq1' },
    });
    expect(res.id).toBe('event-new');
    expect(prisma.event.create).toHaveBeenCalled();
  });

  it('matchOrCreateEvent: throws without cityId', async () => {
    const prisma = makePrismaMock();
    const svc = new IngestionDedupService(prisma as any, 100);
    await expect(
      svc.matchOrCreateEvent({ title: 'No city', cityId: null as any, source: { source: 'TICKETMASTER', externalId: '1' } })
    ).rejects.toThrow(/cityId/);
  });
});

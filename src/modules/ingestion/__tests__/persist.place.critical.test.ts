import { IngestionPersistService } from '../persist.service.js';

// Types re-exported in persist.service.ts to ease testing without deep imports
import type { IngestionDedupService as IDedup, IngestionMergeService as IMerge } from '../persist.service.js';

// Minimal Prisma mock builder focused on Place/PlaceSource paths
function makePrismaMock(overrides: Partial<any> = {}) {
  const base = {
    place: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'P1',
        name: null,
        address: null,
        imageUrl: null,
        url: null,
        rating: null,
        reviewCount: 0,
        // To avoid scoreUpdate/providerUpdate when asserting "unchanged"
        popularityScore: 0.1,
        qualityScore: 0.2,
        freshnessScore: 0.3,
        provider: 'GOOGLE_PLACES',
      }),
      update: jest.fn(),
    },
    placeSource: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
    },
  };
  return { ...base, ...overrides } as any;
}

function makeDedupMock(placeId = 'P1') {
  return {
    matchOrCreatePlace: jest.fn().mockResolvedValue({ targetType: 'place', id: placeId, reason: { type: 'SOURCE' } }),
  } as unknown as IDedup;
}

function makeMergeMock(placeUpdate: any = null) {
  return {
    buildPlaceUpdate: jest.fn().mockReturnValue(placeUpdate),
  } as unknown as IMerge;
}

// For these tests scoring is not important; pass a stub
const scoringStub = { scoreByCanonicalId: (_: string) => ({ popularityScore: 0.1, qualityScore: 0.2, freshnessScore: 0.3 }) } as any;

describe('IngestionPersistService.ingestPlaces (critical idempotency)', () => {
  it('counts unchanged when checksum is the same and PlaceSource exists (no canonical update)', async () => {
    const prisma = makePrismaMock({
      placeSource: {
        findUnique: jest.fn().mockResolvedValue({ id: 'PS1', placeId: 'P1', checksum: 'AAA', sourceUpdatedAt: new Date('2025-01-01T00:00:00Z') }),
        upsert: jest.fn(),
      },
    });
    // No changes to canonical entity
    const merge = makeMergeMock(null);
    const dedup = makeDedupMock('P1');
    const svc = new IngestionPersistService(prisma as any, dedup as any, merge as any, scoringStub);

    const items = [
      {
        name: 'Cafe',
        address: 'Street',
        location: { lat: 50.1, lon: 8.6 },
        cityId: '40',
        rating: 4.2,
        reviewCount: 10,
        checksum: 'AAA',
        sourceUpdatedAt: '2025-01-01T00:00:00Z',
        source: { source: 'GOOGLE_PLACES', externalId: 'gp-1' },
      } as any,
    ];

    const stats = await svc.ingestPlaces('GOOGLE_PLACES', items);
    expect(stats.total).toBe(1);
    expect(stats.unchanged).toBe(1);
    expect(stats.updated).toBe(0);
    expect(stats.created).toBe(0);
    // No update of canonical place
    expect((prisma.place.update as jest.Mock).mock.calls.length).toBe(0);
  });

  it('updates canonical place when checksum changes and sourceUpdatedAt is newer', async () => {
    const prisma = makePrismaMock({
      placeSource: {
        findUnique: jest.fn().mockResolvedValue({ id: 'PS1', placeId: 'P1', checksum: 'OLD', sourceUpdatedAt: new Date('2024-12-31T23:00:00Z') }),
        upsert: jest.fn(),
      },
    });

    // Merge proposes some changes (e.g., imageUrl filled)
    const merge = makeMergeMock({ imageUrl: 'http://img/new.jpg', url: 'http://site' });
    const dedup = makeDedupMock('P1');
    const svc = new IngestionPersistService(prisma as any, dedup as any, merge as any, scoringStub);

    const items = [
      {
        name: 'Cafe X',
        address: 'Street 1',
        location: { lat: 50.11, lon: 8.61 },
        cityId: '40',
        rating: 4.6,
        reviewCount: 23,
        checksum: 'NEW',
        sourceUpdatedAt: '2025-01-01T10:00:00Z', // newer than stored
        source: { source: 'FOURSQUARE', externalId: 'fsq-1' },
      } as any,
    ];

    const stats = await svc.ingestPlaces('FOURSQUARE', items);
    expect(stats.total).toBe(1);
    // Either updated or unchanged depending on merge outcome; here merge proposes changes → updated
    expect(stats.updated).toBe(1);
    expect((prisma.place.update as jest.Mock).mock.calls.length).toBe(1);

    // Source snapshot upserted with new checksum and sourceUpdatedAt
    expect((prisma.placeSource.upsert as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    const upsertArgs = (prisma.placeSource.upsert as jest.Mock).mock.calls[0][0];
    // checksum is computed (sha256 of normalized payload), не сравниваем с литералом,
    // но убеждаемся, что он изменился относительно старого
    expect(upsertArgs.create.checksum).not.toBe('OLD');
    expect(new Date(upsertArgs.create.sourceUpdatedAt).toISOString()).toBe('2025-01-01T10:00:00.000Z');
  });

  it('counts created when PlaceSource is new and no canonical update is needed', async () => {
    const prisma = makePrismaMock({
      place: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'P1', name: 'Cafe', address: 'Street', imageUrl: 'http://img', url: 'http://site',
          // scores already set to avoid scoreUpdate
          popularityScore: 0.1, qualityScore: 0.2, freshnessScore: 0.3,
          provider: 'GOOGLE_PLACES',
        }),
        update: jest.fn(),
      },
      placeSource: {
        findUnique: jest.fn().mockResolvedValue(null), // new source link
        upsert: jest.fn(),
      },
    });
    // No canonical changes proposed
    const merge = makeMergeMock(null);
    const dedup = makeDedupMock('P1');
    const svc = new IngestionPersistService(prisma as any, dedup as any, merge as any, scoringStub);

    const items = [
      {
        name: 'Cafe',
        address: 'Street',
        location: { lat: 50.1, lon: 8.6 },
        cityId: '40',
        rating: 4.2,
        reviewCount: 10,
        checksum: 'XYZ',
        sourceUpdatedAt: '2025-01-02T00:00:00Z',
        source: { source: 'FOURSQUARE', externalId: 'fsq-new' },
      } as any,
    ];

    const stats = await svc.ingestPlaces('FOURSQUARE', items);
    expect(stats.total).toBe(1);
    expect(stats.created).toBe(1); // new source link counted as created
    expect(stats.updated).toBe(0);
    expect(stats.unchanged).toBe(0);
    expect((prisma.place.update as jest.Mock).mock.calls.length).toBe(0);
    expect((prisma.placeSource.upsert as jest.Mock).mock.calls.length).toBeGreaterThan(0);
  });
});

import { GeoService } from '../../geo/geo.service.js';

jest.mock('../../ingestion/ingestion.service.js', () => ({
  runOnlineIngest: jest.fn().mockResolvedValue({
    placeStats: { total: 0, created: 0, updated: 0, unchanged: 0, errors: 0 },
    eventStats: { total: 0, created: 0, updated: 0, unchanged: 0, errors: 0 },
  }),
}));

jest.mock('../search.service.js', () => ({
  searchUnifiedFromDb: jest.fn().mockResolvedValue({ items: [], meta: { total: 0 } }),
}));

// Ensure provider builders and logger don’t cause side effects during tests
jest.mock('../../ingestion/provider.adapters.js', () => ({
  buildEventProviders: jest.fn().mockReturnValue([]),
  buildPlaceProviders: jest.fn().mockReturnValue([]),
}));
jest.mock('../../ingestion/ingest.logger.js', () => ({
  IngestLogger: jest.fn().mockImplementation(() => ({
    log: jest.fn(),
    flushToFile: jest.fn(),
  })),
}));

// We partially mock CacheService to control behavior but preserve buildKey logic if needed
const cacheStubs: any = {};
jest.mock('../../cache/cache.service.js', () => ({
  CacheService: jest.fn().mockImplementation(() => ({
    isEnabled: () => true,
    getJSONWithSWR: cacheStubs.getJSONWithSWR,
    setJSONWithSWR: cacheStubs.setJSONWithSWR ?? jest.fn(),
    withLock: cacheStubs.withLock ?? jest.fn(),
    buildKey: (new (jest.requireActual('../../cache/cache.service.js').CacheService as any)({})).buildKey,
  })),
  normalizeArray: jest.requireActual('../../cache/cache.service.js').normalizeArray,
  roundGeo: jest.requireActual('../../cache/cache.service.js').roundGeo,
}));

describe('/api/search critical behavior', () => {
  let app: any;
  let capturedHandler: (req: any) => Promise<any>;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();

    // reset cache stubs default behaviors
    cacheStubs.getJSONWithSWR = jest.fn().mockResolvedValue(null);
    cacheStubs.setJSONWithSWR = jest.fn();
    cacheStubs.withLock = jest.fn();

    capturedHandler = undefined as any;
    app = {
      config: {
        TICKETMASTER_API_KEY: 'x',
        PREDICTHQ_TOKEN: 'x',
        GEOAPIFY_API_KEY: 'x',
        GOOGLE_PLACES_API_KEY: 'x',
        FOURSQUARE_API_KEY: 'x',
      },
      prisma: {},
      post: (_path: string, _opts: any, handler: any) => {
        capturedHandler = handler;
      },
    };
    const mod = await import('../search.routes.js');
    await (mod.default as any)(app);
    expect(typeof capturedHandler).toBe('function');
  });

  it('triggers online ingest only on first page', async () => {
    const { runOnlineIngest } = await import('../../ingestion/ingestion.service.js');
    const { searchUnifiedFromDb } = await import('../search.service.js');

    // First page
    const req1 = { body: { target: 'ALL', pagination: { page: 1, limit: 20 } }, log: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } } as any;
    await capturedHandler(req1);
    expect(runOnlineIngest).toHaveBeenCalledTimes(1);
    expect(searchUnifiedFromDb).toHaveBeenCalledTimes(1);

    // Second page — no ingest
    (searchUnifiedFromDb as jest.Mock).mockClear();
    const req2 = { body: { target: 'ALL', pagination: { page: 2, limit: 20 } }, log: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } } as any;
    await capturedHandler(req2);
    expect(runOnlineIngest).toHaveBeenCalledTimes(1);
    expect(searchUnifiedFromDb).toHaveBeenCalledTimes(1);
  });

  it('SWR stale path returns cached data and attempts background lock', async () => {
    const cached = { items: [{ id: 1 }], meta: { total: 1 } };
    cacheStubs.getJSONWithSWR.mockResolvedValue({ data: cached, stale: true });
    cacheStubs.withLock.mockImplementation(async () => null);

    const { runOnlineIngest } = await import('../../ingestion/ingestion.service.js');

    const res = await capturedHandler({ body: { target: 'ALL', pagination: { page: 1, limit: 10 } }, log: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } } as any);
    expect(res).toEqual(cached);
    expect(cacheStubs.withLock).toHaveBeenCalledTimes(1);
    // must not block on ingest synchronously
    expect(runOnlineIngest).toHaveBeenCalledTimes(0);
  });

  it('enriches BaseQuery from cityId when geo is missing', async () => {
    const { runOnlineIngest } = await import('../../ingestion/ingestion.service.js');
    const spy = jest.spyOn(GeoService.prototype, 'getCityById').mockReturnValue({
      name: 'Frankfurt',
      countryCode: 'DE',
      coordinates: { lat: 50.11, lon: 8.68 },
      boundingBox: { minLat: 50.0, minLon: 8.5, maxLat: 50.2, maxLon: 8.9 },
    } as any);

    const req = { body: { target: 'ALL', where: { city: { id: '40' } }, pagination: { page: 1, limit: 10 } }, log: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } } as any;
    await capturedHandler(req);

    // Capture BaseQuery used in runOnlineIngest
    expect((runOnlineIngest as jest.Mock).mock.calls.length).toBe(1);
    const baseQueryArg = (runOnlineIngest as jest.Mock).mock.calls[0][1];
    // At minimum, cityId is propagated; radiusKm should be numeric
    expect(baseQueryArg.cityId).toBe('40');
    expect(typeof baseQueryArg.radiusKm).toBe('number');
  });

  it('builds identical cache keys for equivalent queries (geo rounding and filters order)', async () => {
    // Re-register route (not strictly necessary, but keeps symmetry with other tests)
    const app2: any = {
      config: app.config,
      prisma: {},
      post: (_: string, __: any, handler: any) => { capturedHandler = handler; },
    };
    const mod = await import('../search.routes.js');
    await (mod.default as any)(app2);

    // Build two semantically equivalent queries
    const q1 = {
      target: 'ALL',
      where: { geo: { lat: 50.1100001, lon: 8.6800001, radiusKm: 5 }, city: { id: '40' } },
      filters: { categorySlugs: ['music', 'theatre'], sources: ['FOURSQUARE', 'GOOGLE_PLACES'] },
      pagination: { page: 1, limit: 20 },
    } as any;
    const q2 = {
      target: 'ALL',
      where: { geo: { lat: 50.11, lon: 8.68, radiusKm: 5 }, city: { id: '40' } },
      filters: { categorySlugs: ['theatre', 'music'], sources: ['GOOGLE_PLACES', 'FOURSQUARE'] },
      pagination: { page: 1, limit: 20 },
    } as any;

    // Intercept final cache key via mocked CacheService.getJSONWithSWR, which receives the built key
    const keys: string[] = [];
    cacheStubs.getJSONWithSWR = jest.fn(async (key: string) => {
      keys.push(key);
      return null; // force cache miss so route proceeds
    });

    await capturedHandler({ body: q1, log: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } } as any);
    await capturedHandler({ body: q2, log: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } } as any);

    expect(keys.length).toBeGreaterThanOrEqual(2);
    expect(keys[0]).toBe(keys[1]);
  });
});

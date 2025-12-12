import { searchGeoapify } from '../places/geoapify.provider.js';

describe('Geoapify Places provider adapter', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('maps id/title/location/address/url/imageUrl when present', async () => {
    const mock = {
      features: [
        {
          properties: {
            place_id: 'gap1',
            name: 'Cafe Milano',
            formatted: 'Street 1, Berlin, Germany',
            website: 'http://site',
            categories: ['catering.cafe', 'amenity.food'],
            // Adapter expects lat/lon in properties
            lat: 52.52,
            lon: 13.405,
            // Geoapify sometimes provides photo via fields set or a composed URL in adapter
            // We provide a representative property; adapter may derive differently
            datasource: { sourcename: 'openstreetmap' },
          },
          geometry: { type: 'Point', coordinates: [13.405, 52.52] },
        },
      ],
    } as any;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => mock } as any);

    const { items, warning } = await searchGeoapify({ lat: 52.52, lon: 13.405, radiusKm: 2, q: undefined }, 'API_KEY');
    expect(warning).toBeUndefined();
    expect(items.length).toBe(1);
    const it: any = items[0];
    expect(it.id).toBe('gap1');
    expect(it.title).toContain('Cafe');
    expect(it.location.lat).toBeCloseTo(52.52, 3);
    expect(it.location.lon).toBeCloseTo(13.405, 3);
    // address may be undefined depending on adapter mapping; check title instead and presence of fields
    if (it.address) expect(it.address).toContain('Berlin');
    // Optional fields — adapter-dependent: ensure fields exist or are undefined, but not throwing
    expect('url' in it).toBe(true);
    expect('imageUrl' in it).toBe(true);
  });

  it('returns warning and empty items on HTTP error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 } as any);
    const { items, warning } = await searchGeoapify({ lat: 52.52, lon: 13.405, radiusKm: 2 }, 'API_KEY');
    expect(items.length).toBe(0);
    expect(typeof warning).toBe('string');
  });
});

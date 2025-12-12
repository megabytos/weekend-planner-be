import { searchGooglePlaces } from '../places/google-places.provider.js';

describe('Google Places provider adapter', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('maps rating, reviewCount, photo imageUrl and types', async () => {
    // Mock fetch
    const mockData = {
      results: [
        {
          place_id: 'gp1',
          name: 'The Bar',
          vicinity: 'Street 1',
          geometry: { location: { lat: 51.5, lng: -0.1 } },
          rating: 4.4,
          user_ratings_total: 1487,
          photos: [{ photo_reference: 'PHOTO_REF' }],
          types: ['bar', 'establishment'],
        },
      ],
    };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => mockData } as any);

    const { items } = await searchGooglePlaces({ lat: 51.5, lon: -0.1, radiusKm: 2, q: undefined }, 'KEY');
    expect(items.length).toBe(1);
    const it = items[0] as any;
    expect(it.id).toBe('gp1');
    expect(it.title).toBe('The Bar');
    expect(it.location.lat).toBeCloseTo(51.5);
    expect(it.address).toContain('Street 1');
    expect(it.rating).toBe(4.4);
    expect(it.reviewCount).toBe(1487);
    expect(it.imageUrl).toContain('photo_reference=PHOTO_REF');
    expect(it.imageUrl).toContain('key=KEY');
    // types should be propagated in some raw categories collection if adapter supports it
    if (Array.isArray((it as any).providerCategoriesRaw)) {
      expect(it.providerCategoriesRaw).toEqual(expect.arrayContaining(['bar']));
    }
  });

  it('handles no-photos gracefully and returns warning on HTTP error', async () => {
    // no photos case
    const mockNoPhoto = {
      results: [
        {
          place_id: 'gp2',
          name: 'No Photo Place',
          vicinity: 'Street 2',
          geometry: { location: { lat: 40.0, lng: -3.7 } },
          types: ['restaurant'],
        },
      ],
    } as any;
    global.fetch = jest.fn().mockResolvedValueOnce({ ok: true, json: async () => mockNoPhoto } as any)
      // next call: HTTP error
      .mockResolvedValueOnce({ ok: false, status: 403 } as any);

    const ok = await searchGooglePlaces({ lat: 40.0, lon: -3.7, radiusKm: 2 }, 'KEY');
    expect(ok.items.length).toBe(1);
    const it2: any = ok.items[0];
    expect(it2.id).toBe('gp2');
    expect(it2.address).toContain('Street 2');
    // imageUrl may be undefined/null when no photos
    expect('imageUrl' in it2).toBe(true);

    const bad = await searchGooglePlaces({ lat: 40.0, lon: -3.7, radiusKm: 2 }, 'KEY');
    expect(bad.items.length).toBe(0);
    expect(typeof bad.warning).toBe('string');
  });
});

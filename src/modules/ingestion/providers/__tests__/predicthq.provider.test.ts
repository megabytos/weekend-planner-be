import { searchPredictHQ } from '../events/predicthq.provider.js';

describe('PredictHQ Events provider adapter', () => {
  beforeEach(() => jest.resetAllMocks());

  it('maps id/title/time and categories (smoke)', async () => {
    const mock = {
      count: 1,
      results: [
        {
          id: 'phq1',
          title: 'Tech Conference',
          start: '2025-06-01T09:00:00Z',
          end: '2025-06-01T18:00:00Z',
          category: 'conferences',
          labels: ['technology'],
          // Some responses contain geometry/coordinates; keep minimal valid shape
          location: { lat: 51.5, lon: -0.09 },
          // url-like field may be present depending on scope; adapter may ignore
        },
      ],
    } as any;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => mock } as any);

    const { items, warning } = await searchPredictHQ({ lat: 51.5, lon: -0.09, radiusKm: 25, q: 'tech' }, 'PHQ');
    expect(warning).toBeUndefined();
    expect(items.length).toBe(1);
    const it: any = items[0];
    expect(it.id).toBe('phq1');
    expect(it.title).toContain('Tech');
    // time fields are exposed via occurrences[] in adapter
    expect(Array.isArray(it.occurrences)).toBe(true);
    const occ = it.occurrences[0];
    expect(occ.start).toBe('2025-06-01T09:00:00Z');
    expect(occ.end).toBe('2025-06-01T18:00:00Z');
    // categories/raw present in adapter as categoriesRaw
    expect(Array.isArray(it.categoriesRaw)).toBe(true);
  });

  it('returns warning and empty items on HTTP error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 } as any);
    const { items, warning } = await searchPredictHQ({ lat: 51.5, lon: -0.09, radiusKm: 25 }, 'PHQ');
    expect(items.length).toBe(0);
    expect(typeof warning).toBe('string');
  });
});

import { searchTicketmaster } from '../events/ticketmaster.provider.js';

describe('Ticketmaster Events provider adapter', () => {
  beforeEach(() => jest.resetAllMocks());

  it('maps id/title/time, imageUrl/ticketsUrl and categories when present', async () => {
    const mock = {
      page: { totalElements: 1 },
      _embedded: {
        events: [
          {
            id: 'tm1',
            name: 'Rock Concert',
            url: 'https://tickets/tm1',
            images: [{ url: 'http://img1.jpg' }],
            dates: {
              start: { dateTime: '2025-01-01T20:00:00Z' },
              end: { dateTime: '2025-01-01T22:30:00Z' },
              timezone: 'Europe/Berlin',
            },
            classifications: [
              { segment: { name: 'Music' }, genre: { name: 'Rock' } },
            ],
            _embedded: {
              venues: [
                { city: { name: 'Berlin' }, location: { latitude: '52.52', longitude: '13.405' } },
              ],
            },
          },
        ],
      },
    } as any;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => mock } as any);

    const { items, warning } = await searchTicketmaster({ lat: 52.52, lon: 13.405, radiusKm: 10, q: 'rock' }, 'TM');
    expect(warning).toBeUndefined();
    expect(items.length).toBe(1);
    const it: any = items[0];
    expect(it.id).toBe('tm1');
    expect(it.title).toContain('Rock');
    expect(Array.isArray(it.occurrences)).toBe(true);
    const occ = it.occurrences[0];
    expect(occ.start).toBe('2025-01-01T20:00:00Z');
    expect(occ.end).toBeUndefined(); // adapter sets start + timezone, end may be omitted
    expect(occ.timezone).toBe('Europe/Berlin');
    expect(it.imageUrl).toContain('http');
    expect(it.url).toContain('tickets');
    // coordinates mapped when present
    expect(it.location.lat).toBeCloseTo(52.52, 3);
    expect(it.location.lon).toBeCloseTo(13.405, 3);
    // categories
    expect(Array.isArray(it.categoriesRaw)).toBe(true);
  });

  it('returns warning and empty items on HTTP error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 } as any);
    const { items, warning } = await searchTicketmaster({ lat: 52.52, lon: 13.405, radiusKm: 10 }, 'TM');
    expect(items.length).toBe(0);
    expect(typeof warning).toBe('string');
  });
});

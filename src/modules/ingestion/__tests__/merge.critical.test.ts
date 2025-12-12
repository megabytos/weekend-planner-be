import { IngestionMergeService } from '../merge.service.js';

describe('IngestionMergeService — critical freshness priority', () => {
  const svc = new IngestionMergeService();

  describe('buildPlaceUpdate freshness by sourceUpdatedAt', () => {
    it('rejects update when incoming sourceUpdatedAt is older than existing', () => {
      const existing: any = {
        name: 'Best Cafe',
        address: 'Main St',
        imageUrl: 'http://old.img',
        url: 'http://old.site',
        // suppose we have metadata of last update time in domain; for test we pass via param
      };
      const normalized: any = {
        name: 'Best Cafe',
        address: 'Main St',
        imageUrl: 'http://worse.img',
        url: null,
      };
      const older = new Date('2024-12-31T23:00:00Z');
      const upd = svc.buildPlaceUpdate(existing, normalized, 'GOOGLE_PLACES', older);
      // Expect no update if logic protects against older sources
      expect(upd).toBeNull();
    });

    it('accepts update when incoming sourceUpdatedAt is newer and actually improves fields', () => {
      const existing: any = {
        name: null,
        address: null,
        imageUrl: null,
        url: null,
        rating: null,
        reviewCount: 0,
      };
      const normalized: any = {
        name: 'Cafe X',
        address: 'Street 1',
        imageUrl: 'http://new.img',
        url: 'http://site',
        rating: 4.6,
        reviewCount: 23,
      };
      const newer = new Date('2025-01-01T10:00:00Z');
      const upd = svc.buildPlaceUpdate(existing, normalized, 'FOURSQUARE', newer) as any;
      expect(upd).toBeTruthy();
      expect(upd.name).toBe('Cafe X');
      expect(upd.address).toBe('Street 1');
      expect(upd.imageUrl).toBe('http://new.img');
      expect(upd.url).toBe('http://site');
      // rating/reviewCount set only if missing/0 — consistent with existing tests
      expect(upd.rating).toBe(4.6);
      expect(upd.reviewCount).toBe(23);
    });
  });

  describe('buildEventUpdate freshness by sourceUpdatedAt', () => {
    it('rejects event update for older sourceUpdatedAt', () => {
      const existing: any = { title: 'Concert', description: 'Desc', imageUrl: 'http://img' };
      const normalized: any = { title: 'Concert', description: 'Worse', imageUrl: null };
      const older = new Date('2024-12-31T20:00:00Z');
      const upd = svc.buildEventUpdate(existing, normalized, 'TICKETMASTER', older);
      expect(upd).toBeNull();
    });

    it('accepts event update for newer sourceUpdatedAt and missing existing fields', () => {
      const existing: any = { title: null, description: null, imageUrl: null };
      const normalized: any = { title: 'Show', description: 'Great', imageUrl: 'http://img2' };
      const newer = new Date('2025-01-02T08:00:00Z');
      const upd = svc.buildEventUpdate(existing, normalized, 'PREDICTHQ', newer) as any;
      expect(upd).toBeTruthy();
      expect(upd.title).toBe('Show');
      expect(upd.description).toBe('Great');
      expect(upd.imageUrl).toBe('http://img2');
    });
  });
});

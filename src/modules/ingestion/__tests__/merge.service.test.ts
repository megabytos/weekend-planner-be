import { IngestionMergeService } from '../merge.service.js';

describe('IngestionMergeService', () => {
  const svc = new IngestionMergeService();

  describe('buildPlaceUpdate', () => {
    it('does not overwrite non-empty fields with empties', () => {
      const existing = { name: 'Name', address: 'Addr', imageUrl: 'img', url: 'http://x' };
      const normalized: any = { name: '', address: '', imageUrl: null, url: null };
      const upd = svc.buildPlaceUpdate(existing as any, normalized, 'GOOGLE_PLACES', null);
      expect(upd).toBeNull();
    });

    it('fills missing imageUrl/url only when provided', () => {
      const existing = { name: '', address: '', imageUrl: null, url: null };
      const normalized: any = { name: 'Cafe', address: 'Street', imageUrl: 'http://img', url: 'http://site' };
      const upd = svc.buildPlaceUpdate(existing as any, normalized, 'GOOGLE_PLACES', null) as any;
      expect(upd).toBeTruthy();
      expect(upd.imageUrl).toBe('http://img');
      expect(upd.url).toBe('http://site');
      expect(upd.name).toBe('Cafe');
      expect(upd.address).toBe('Street');
    });

    it('sets rating/reviewCount only if missing/0', () => {
      const existing = { name: null, address: null, imageUrl: null, url: null, rating: null, reviewCount: 0 };
      const normalized: any = { rating: 4.5, reviewCount: 123 };
      const upd = svc.buildPlaceUpdate(existing as any, normalized, 'GOOGLE_PLACES', null) as any;
      expect(upd.rating).toBe(4.5);
      expect(upd.reviewCount).toBe(123);

      const existing2 = { name: null, address: null, imageUrl: null, url: null, rating: 4.2, reviewCount: 50 };
      const upd2 = svc.buildPlaceUpdate(existing2 as any, normalized, 'GOOGLE_PLACES', null) as any;
      // already set -> no change for rating/reviewCount
      if (upd2) {
        expect(upd2.rating).toBeUndefined();
        expect(upd2.reviewCount).toBeUndefined();
      }
    });
  });

  describe('buildEventUpdate', () => {
    it('does not overwrite non-empty event fields with empties', () => {
      const existing = { title: 'T', description: 'D', imageUrl: 'img' };
      const normalized: any = { title: '', description: null, imageUrl: null };
      const upd = svc.buildEventUpdate(existing as any, normalized, 'TICKETMASTER', null);
      expect(upd).toBeNull();
    });

    it('fills missing event fields from normalized', () => {
      const existing = { title: null, description: null, imageUrl: null };
      const normalized: any = { title: 'Concert', description: 'Great', imageUrl: 'http://img' };
      const upd = svc.buildEventUpdate(existing as any, normalized, 'TICKETMASTER', null) as any;
      expect(upd.title).toBe('Concert');
      expect(upd.description).toBe('Great');
      expect(upd.imageUrl).toBe('http://img');
    });
  });
});

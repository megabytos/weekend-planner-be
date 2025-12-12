import { IngestionScoringService } from '../scoring.service.js';

describe('IngestionScoringService', () => {
  it('returns deterministic scores for the same id', () => {
    const svc = new IngestionScoringService('test-salt');
    const a1 = svc.scoreByCanonicalId('abc');
    const a2 = svc.scoreByCanonicalId('abc');
    expect(a1).toEqual(a2);
    // All values in [0,1)
    expect(a1.popularityScore).toBeGreaterThanOrEqual(0);
    expect(a1.popularityScore).toBeLessThan(1);
    expect(a1.qualityScore).toBeGreaterThanOrEqual(0);
    expect(a1.qualityScore).toBeLessThan(1);
    expect(a1.freshnessScore).toBeGreaterThanOrEqual(0);
    expect(a1.freshnessScore).toBeLessThan(1);
  });

  it('returns different scores for different ids', () => {
    const svc = new IngestionScoringService('test-salt');
    const a = svc.scoreByCanonicalId('id-1');
    const b = svc.scoreByCanonicalId('id-2');
    expect(a).not.toEqual(b);
  });
});

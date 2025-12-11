import crypto from "node:crypto";

export type ScoreTriple = {
  popularityScore: number;
  qualityScore: number;
  freshnessScore: number;
};

// Simple deterministic PRNG from a string seed -> [0,1)
function hashToFloat(seed: string): number {
  const h = crypto.createHash("sha256").update(seed).digest();
  // take first 4 bytes as unsigned int
  const n = h.readUInt32BE(0);
  return n / 0xffffffff; // in [0,1)
}

export class IngestionScoringService {
  constructor(private readonly scopeSalt = "v1") {}

  scoreByCanonicalId(id: string): ScoreTriple {
    const popularity = hashToFloat(`${this.scopeSalt}:pop:${id}`);
    const quality = hashToFloat(`${this.scopeSalt}:qual:${id}`);
    const freshness = hashToFloat(`${this.scopeSalt}:fresh:${id}`);
    return {
      popularityScore: popularity,
      qualityScore: quality,
      freshnessScore: freshness,
    };
  }
}

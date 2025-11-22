export type SearchTimeWindow = { fromISO?: string; toISO?: string };
export type GeoPoint = { lat?: number; lon?: number; radiusKm?: number };

export type EventQuery = GeoPoint & SearchTimeWindow & {
  q?: string;
  page?: number;
  size?: number;
};

export type NormalizedOccurrence = { start: string; end?: string; timezone?: string; url?: string };
export type NormalizedEvent = {
  id: string;
  name: string;
  description?: string;
  url?: string;
  imageUrl?: string;
  location?: { lat: number; lon: number };
  address?: string;
  occurrences?: NormalizedOccurrence[];
  source: { source: string; externalId: string; url?: string };
};

export interface EventProvider {
  searchEvents(query: EventQuery): Promise<{ items: NormalizedEvent[]; total?: number; warning?: string }>;
  name: string;
}

// Orchestrates multiple event providers (placeholder)
export async function aggregateEvents(providers: EventProvider[], query: EventQuery) {
  const all: NormalizedEvent[] = [];
  const warnings: string[] = [];
  for (const p of providers) {
    try {
      const { items, warning } = await p.searchEvents(query);
      if (warning) warnings.push(`${p.name}: ${warning}`);
      all.push(...items);
    } catch (e: any) {
      warnings.push(`${p.name}: ${e?.message || 'error'}`);
    }
  }
  return { items: all, warnings };
}

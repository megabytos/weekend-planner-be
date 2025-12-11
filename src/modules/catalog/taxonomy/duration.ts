import { TAXONOMY_CATEGORIES } from './taxonomy.constants.js';

// Random minutes with fixed step, inclusive of bounds
function randStepMinutes(min: number, max: number, step: number): number {
  const steps = Math.floor((max - min) / step) + 1;
  const idx = Math.floor(Math.random() * steps);
  return min + idx * step;
}

export function resolveExpectedDurationForEvent(categorySlug?: string | null): number {
  // If no category or it's explicitly "other" — return a random reasonable duration
  if (!categorySlug || categorySlug === 'event.other') {
    return randStepMinutes(90, 180, 10);
  }
  const cat = TAXONOMY_CATEGORIES.find((c) => c.slug === categorySlug && c.type === 'EVENT');
  if (!cat) return randStepMinutes(90, 180, 10);
  return (cat as any).expected_duration ?? randStepMinutes(90, 180, 10);
}

export function resolveExpectedDurationForPlace(categorySlug?: string | null): number {
  if (!categorySlug || categorySlug === 'place.other') {
    return randStepMinutes(60, 120, 10);
  }
  const cat = TAXONOMY_CATEGORIES.find((c) => c.slug === categorySlug && c.type === 'PLACE');
  if (!cat) return randStepMinutes(60, 120, 10);
  return (cat as any).expected_duration ?? randStepMinutes(60, 120, 10);
}

// For consumers that need a deterministic addition of minutes to ISO
export function addMinutesISO(iso: string, minutes: number): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

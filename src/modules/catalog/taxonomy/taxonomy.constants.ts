// Central taxonomy constants (temporary, later can be replaced by DB)

export type TaxonomyCategoryType = 'EVENT' | 'PLACE' | 'TAG';

export type TaxonomyCategory = {
    slug: string;        // e.g. "event.concert_show" or "place.food_restaurant"
    type: TaxonomyCategoryType;
    name: string;        // display name (en)
};

// Import category lists (only type imports to avoid runtime cycles)
import { EVENT_CATEGORIES as EVENT_INTERNAL } from './categories.events.js';
import { PLACE_CATEGORIES as PLACE_INTERNAL } from './categories.places.js';

// Re-export for compatibility if someone imports them from here
export const EVENT_CATEGORIES = EVENT_INTERNAL;
export const PLACE_CATEGORIES = PLACE_INTERNAL;

// Tags can be added later
export const TAG_CATEGORIES: TaxonomyCategory[] = [];

export const TAXONOMY_CATEGORIES: TaxonomyCategory[] = [
    ...EVENT_INTERNAL,
    ...PLACE_INTERNAL,
    ...TAG_CATEGORIES,
];

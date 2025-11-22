import type { PlaceCategorySlug } from './categories.places';

// Geoapify categories look like "catering.restaurant", "entertainment.cinema", etc.
export type GeoapifyCategory = string;

// Mapping from our internal place categories to Geoapify categories that we use in requests
export const PLACE_TO_GEOAPIFY: Record<PlaceCategorySlug, GeoapifyCategory[]> = {
    // Food & drinks
    'place.food_restaurant': ['catering.restaurant'],
    'place.food_cafe_coffee': ['catering.cafe'],
    'place.food_fast_street': ['catering.fast_food'],
    'place.food_dessert_bakery': [
        'catering.cafe.ice_cream',
        'catering.cafe.dessert',
        'commercial.food_and_drink.bakery'
    ],

    'place.bar_pub': ['catering.bar', 'catering.pub', 'catering.taproom'],
    // Geoapify: nightclubs are under the adult.* namespace
    'place.nightlife_club': ['adult.nightclub'],

    // Culture & entertainment venues
    'place.culture_museum_gallery': [
        'entertainment.museum',
        'entertainment.culture.gallery'
    ],
    'place.culture_theatre_venue': [
        'entertainment.culture.theatre',
        'entertainment.culture.arts_centre'
    ],
    'place.culture_cinema': ['entertainment.cinema'],

    // Family & fun
    'place.family_zoo_aqua_theme': [
        'entertainment.zoo',
        'entertainment.aquarium',
        'entertainment.theme_park',
        'entertainment.water_park'
    ],
    'place.fun_bowling_arcade_escape': [
        'entertainment.bowling_alley',
        'entertainment.amusement_arcade',
        'entertainment.escape_game',
        'entertainment.miniature_golf'
    ],

    // Outdoor & nature
    'place.outdoor_park_garden': ['leisure.park'],
    'place.outdoor_nature_hiking': ['natural.forest', 'natural.mountain'],
    'place.outdoor_beach_waterfront': ['beach', 'beach.beach_resort'],

    // Sport & wellness
    'place.sport_fitness_stadium': [
        'sport.fitness.fitness_centre',
        'sport.stadium',
        'sport.swimming_pool',
        'sport.ice_rink'
    ],
    'place.spa_wellness_sauna': [
        'service.beauty.spa',
        'service.beauty.massage',
        'building.spa'
    ],

    // Shopping
    'place.shopping_mall_department': [
        'commercial.shopping_mall',
        'commercial.department_store'
    ],
    'place.shopping_market_souvenir': [
        'commercial.marketplace',
        'commercial.food_and_drink',
        'commercial.gift_and_souvenir'
    ],

    // Sights & landmarks
    'place.sight_landmark_historic': [
        'tourism.attraction',
        'tourism.attraction.viewpoint',
        'tourism.sights.castle',
        'tourism.sights.fort',
        'tourism.sights.tower',
        'tourism.sights.city_gate',
        'tourism.sights.bridge',
        'tourism.sights.city_hall',
        'tourism.sights.lighthouse',
        'tourism.sights.ruines',
        'tourism.sights.archaeological_site',
        'tourism.sights.memorial.monument'
    ],
    'place.sight_religion_worship': [
        'religion.place_of_worship',
        'tourism.sights.place_of_worship'
    ],

    // Kids
    'place.kids_playground': ['leisure.playground']
};

export interface GeoapifyToPlaceRule {
    categoryPrefix: string;
    placeCategory: PlaceCategorySlug;
}

// Rules for mapping Geoapify categories back to our internal place categories
export const GEOAPIFY_CATEGORY_RULES: GeoapifyToPlaceRule[] = [
    { categoryPrefix: 'catering.restaurant', placeCategory: 'place.food_restaurant' },
    { categoryPrefix: 'catering.cafe', placeCategory: 'place.food_cafe_coffee' },
    { categoryPrefix: 'catering.fast_food', placeCategory: 'place.food_fast_street' },

    { categoryPrefix: 'catering.bar', placeCategory: 'place.bar_pub' },
    { categoryPrefix: 'catering.pub', placeCategory: 'place.bar_pub' },
    { categoryPrefix: 'catering.taproom', placeCategory: 'place.bar_pub' },

    // nightclubs → nightlife
    { categoryPrefix: 'adult.nightclub', placeCategory: 'place.nightlife_club' },

    { categoryPrefix: 'entertainment.cinema', placeCategory: 'place.culture_cinema' },
    { categoryPrefix: 'entertainment.museum', placeCategory: 'place.culture_museum_gallery' },
    { categoryPrefix: 'entertainment.culture', placeCategory: 'place.culture_theatre_venue' },

    { categoryPrefix: 'leisure.park', placeCategory: 'place.outdoor_park_garden' },
    { categoryPrefix: 'beach', placeCategory: 'place.outdoor_beach_waterfront' },

    // sport.* (sport, sport.stadium, sport.swimming_pool, etc.)
    { categoryPrefix: 'sport', placeCategory: 'place.sport_fitness_stadium' },

    { categoryPrefix: 'service.beauty', placeCategory: 'place.spa_wellness_sauna' },

    { categoryPrefix: 'commercial.shopping_mall', placeCategory: 'place.shopping_mall_department' },
    { categoryPrefix: 'commercial.department_store', placeCategory: 'place.shopping_mall_department' },

    { categoryPrefix: 'commercial.marketplace', placeCategory: 'place.shopping_market_souvenir' },
    { categoryPrefix: 'commercial.food_and_drink', placeCategory: 'place.shopping_market_souvenir' },
    { categoryPrefix: 'commercial.gift_and_souvenir', placeCategory: 'place.shopping_market_souvenir' },

    { categoryPrefix: 'tourism.attraction', placeCategory: 'place.sight_landmark_historic' },
    { categoryPrefix: 'tourism.sights', placeCategory: 'place.sight_landmark_historic' },

    { categoryPrefix: 'religion.place_of_worship', placeCategory: 'place.sight_religion_worship' },

    { categoryPrefix: 'leisure.playground', placeCategory: 'place.kids_playground' }
];

export function mapGeoapifyCategoriesToPlaceCategory(
    categories: string[]
): PlaceCategorySlug | null {
    for (const cat of categories) {
        const rule = GEOAPIFY_CATEGORY_RULES.find((r) =>
            cat.startsWith(r.categoryPrefix)
        );
        if (rule) return rule.placeCategory;
    }
    return null;
}

/**
 * Maps an array of place category slugs to their corresponding Geoapify categories.
 * If no place categories are provided, the method processes all available categories.
 *
 * @param {readonly PlaceCategorySlug[]} [placeCategories] - An optional array of place category slugs to map.
 * If not provided, all available place categories will be processed.
 * @return {GeoapifyCategory[]} An array of Geoapify categories corresponding to the given place category slugs.
 */
export function getGeoapifyCategoriesForPlaceCategories(
    placeCategories?: readonly PlaceCategorySlug[],
): GeoapifyCategory[] {
    const usedSlugs: PlaceCategorySlug[] = placeCategories?.length
        ? [...placeCategories]
        : (Object.keys(PLACE_TO_GEOAPIFY) as PlaceCategorySlug[]);

    const seen = new Set<string>();
    const result: GeoapifyCategory[] = [];

    for (const slug of usedSlugs) {
        const cats = PLACE_TO_GEOAPIFY[slug] ?? [];
        for (const c of cats) {
            const key = String(c);
            if (!seen.has(key)) {
                seen.add(key);
                result.push(c);
            }
        }
    }

    return result;
}

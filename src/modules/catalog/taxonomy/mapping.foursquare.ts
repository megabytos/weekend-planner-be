import type { PlaceCategorySlug } from './categories.places.js';

export type FoursquareRootCategoryLabel =
    | 'Food'
    | 'Nightlife Spot'
    | 'Arts & Entertainment'
    | 'Outdoors & Recreation'
    | 'Shop & Service';

// We work with Foursquare category "name" or "shortName"
// instead of hardcoding all IDs.
export interface FoursquareCategoryLite {
    id: string;
    name: string;
    shortName?: string;
}

// Rule: if category name contains substring -> our place category
export interface FoursquareCategoryRule {
    nameIncludes: string;
    category: PlaceCategorySlug;
}


export const PLACE_TO_FOURSQUARE_ROOT_CATEGORIES: Record<
    PlaceCategorySlug,
    FoursquareRootCategoryLabel[]
> = {
    // Food
    'place.food_restaurant': ['Food'],
    'place.food_cafe_coffee': ['Food'],
    'place.food_fast_street': ['Food'],
    'place.food_dessert_bakery': ['Food'],

    // Bars / nightlife
    'place.bar_pub': ['Food', 'Nightlife Spot'],
    'place.nightlife_club': ['Nightlife Spot'],

    // Culture
    'place.culture_museum_gallery': ['Arts & Entertainment'],
    'place.culture_theatre_venue': ['Arts & Entertainment'],
    'place.culture_cinema': ['Arts & Entertainment'],

    // Family and fun places
    'place.family_zoo_aqua_theme': ['Arts & Entertainment', 'Outdoors & Recreation'],
    'place.fun_bowling_arcade_escape': ['Arts & Entertainment'],

    // Outdoor
    'place.outdoor_park_garden': ['Outdoors & Recreation'],
    'place.outdoor_nature_hiking': ['Outdoors & Recreation'],
    'place.outdoor_beach_waterfront': ['Outdoors & Recreation'],

    // Sports / wellness
    'place.sport_fitness_stadium': ['Outdoors & Recreation', 'Arts & Entertainment'],
    'place.spa_wellness_sauna': ['Arts & Entertainment'],

    // Shopping
    'place.shopping_mall_department': ['Shop & Service'],
    'place.shopping_market_souvenir': ['Shop & Service'],

    // Sights & landmarks
    'place.sight_landmark_historic': ['Arts & Entertainment'],
    'place.sight_religion_worship': ['Arts & Entertainment'],

    // Kids playgrounds
    'place.kids_playground': ['Outdoors & Recreation'],
};

export const FOURSQUARE_CATEGORY_RULES: FoursquareCategoryRule[] = [
    { nameIncludes: 'Restaurant', category: 'place.food_restaurant' },
    { nameIncludes: 'Food Court', category: 'place.food_fast_street' },
    { nameIncludes: 'Fast Food', category: 'place.food_fast_street' },
    { nameIncludes: 'Coffee', category: 'place.food_cafe_coffee' },
    { nameIncludes: 'Bakery', category: 'place.food_dessert_bakery' },
    { nameIncludes: 'Dessert', category: 'place.food_dessert_bakery' },

    { nameIncludes: 'Bar', category: 'place.bar_pub' },
    { nameIncludes: 'Pub', category: 'place.bar_pub' },
    { nameIncludes: 'Nightclub', category: 'place.nightlife_club' },
    { nameIncludes: 'Karaoke', category: 'place.nightlife_club' },

    { nameIncludes: 'Museum', category: 'place.culture_museum_gallery' },
    { nameIncludes: 'Art Gallery', category: 'place.culture_museum_gallery' },
    { nameIncludes: 'Theater', category: 'place.culture_theatre_venue' },
    { nameIncludes: 'Cinema', category: 'place.culture_cinema' },

    { nameIncludes: 'Zoo', category: 'place.family_zoo_aqua_theme' },
    { nameIncludes: 'Aquarium', category: 'place.family_zoo_aqua_theme' },
    { nameIncludes: 'Theme Park', category: 'place.family_zoo_aqua_theme' },
    { nameIncludes: 'Water Park', category: 'place.family_zoo_aqua_theme' },

    { nameIncludes: 'Bowling', category: 'place.fun_bowling_arcade_escape' },
    { nameIncludes: 'Arcade', category: 'place.fun_bowling_arcade_escape' },
    { nameIncludes: 'Escape Room', category: 'place.fun_bowling_arcade_escape' },

    { nameIncludes: 'Park', category: 'place.outdoor_park_garden' },
    { nameIncludes: 'Trail', category: 'place.outdoor_nature_hiking' },
    { nameIncludes: 'Beach', category: 'place.outdoor_beach_waterfront' },

    { nameIncludes: 'Gym', category: 'place.sport_fitness_stadium' },
    { nameIncludes: 'Stadium', category: 'place.sport_fitness_stadium' },
    { nameIncludes: 'Sports Club', category: 'place.sport_fitness_stadium' },

    { nameIncludes: 'Spa', category: 'place.spa_wellness_sauna' },
    { nameIncludes: 'Sauna', category: 'place.spa_wellness_sauna' },

    { nameIncludes: 'Mall', category: 'place.shopping_mall_department' },
    { nameIncludes: 'Shopping Center', category: 'place.shopping_mall_department' },

    { nameIncludes: 'Market', category: 'place.shopping_market_souvenir' },
    { nameIncludes: 'Flea Market', category: 'place.shopping_market_souvenir' },
    { nameIncludes: 'Gift Shop', category: 'place.shopping_market_souvenir' },
    { nameIncludes: 'Souvenir', category: 'place.shopping_market_souvenir' },

    { nameIncludes: 'Historic Site', category: 'place.sight_landmark_historic' },
    { nameIncludes: 'Monument', category: 'place.sight_landmark_historic' },
    { nameIncludes: 'Castle', category: 'place.sight_landmark_historic' },
    { nameIncludes: 'Church', category: 'place.sight_religion_worship' },
    { nameIncludes: 'Cathedral', category: 'place.sight_religion_worship' },
    { nameIncludes: 'Temple', category: 'place.sight_religion_worship' },
    { nameIncludes: 'Mosque', category: 'place.sight_religion_worship' },
    { nameIncludes: 'Synagogue', category: 'place.sight_religion_worship' },

    { nameIncludes: 'Playground', category: 'place.kids_playground' },
    { nameIncludes: 'Kids', category: 'place.kids_playground' }
];

export function mapFoursquareCategoriesToPlaceCategory(
    categories: FoursquareCategoryLite[]
): PlaceCategorySlug | null {
    const names = categories.map(
        (c) => `${c.name} ${c.shortName ?? ''}`.toLowerCase()
    );

    for (const rule of FOURSQUARE_CATEGORY_RULES) {
        const needle = rule.nameIncludes.toLowerCase();
        if (names.some((n) => n.includes(needle))) {
            return rule.category;
        }
    }

    return null;
}


/**
 * Maps a list of place category slugs to their corresponding Foursquare root category labels.
 * Returns a unique set of Foursquare root category labels associated with the provided place categories.
 * If no place categories are provided, uses all available place categories by default.
 *
 * @param {readonly PlaceCategorySlug[]} [placeCategories] - An optional list of place category slugs to map to Foursquare root categories.
 * @return {FoursquareRootCategoryLabel[]} A unique list of Foursquare root category labels derived from the provided place categories.
 */
export function getFoursquareRootCategoriesForPlaceCategories(
    placeCategories?: readonly PlaceCategorySlug[],
): FoursquareRootCategoryLabel[] {
    const usedSlugs: PlaceCategorySlug[] = placeCategories?.length
        ? [...placeCategories]
        : (Object.keys(PLACE_TO_FOURSQUARE_ROOT_CATEGORIES) as PlaceCategorySlug[]);

    const seen = new Set<string>();
    const result: FoursquareRootCategoryLabel[] = [];

    for (const slug of usedSlugs) {
        const roots = PLACE_TO_FOURSQUARE_ROOT_CATEGORIES[slug] ?? [];
        for (const r of roots) {
            const key = String(r);
            if (!seen.has(key)) {
                seen.add(key);
                result.push(r);
            }
        }
    }

    return result;
}
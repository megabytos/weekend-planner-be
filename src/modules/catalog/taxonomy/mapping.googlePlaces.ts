import type { PlaceCategorySlug } from './categories.places';

export type GooglePlaceType = string; // e.g. "restaurant", "cafe", "park"

export const PLACE_TO_GOOGLE_TYPES: Record<PlaceCategorySlug, GooglePlaceType[]> = {
    'place.food_restaurant': ['restaurant'],
    'place.food_cafe_coffee': ['cafe'],
    'place.food_fast_street': ['restaurant', 'meal_takeaway'],
    'place.food_dessert_bakery': ['bakery'],

    'place.bar_pub': ['bar'],
    'place.nightlife_club': ['night_club'],

    'place.culture_museum_gallery': ['museum', 'art_gallery'],
    'place.culture_theatre_venue': ['premise', 'establishment'], // will be refined by venue name/type
    'place.culture_cinema': ['movie_theater'],

    'place.family_zoo_aqua_theme': ['zoo', 'aquarium', 'amusement_park'],
    'place.fun_bowling_arcade_escape': ['bowling_alley', 'amusement_center'],

    'place.outdoor_park_garden': ['park'],
    'place.outdoor_nature_hiking': ['park', 'natural_feature'],
    'place.outdoor_beach_waterfront': ['beach'],

    'place.sport_fitness_stadium': ['gym', 'stadium', 'sports_complex'],
    'place.spa_wellness_sauna': ['spa'],

    'place.shopping_mall_department': ['shopping_mall', 'department_store'],
    'place.shopping_market_souvenir': ['grocery_or_supermarket', 'store'],

    'place.sight_landmark_historic': ['tourist_attraction'],
    'place.sight_religion_worship': ['place_of_worship'],

    'place.kids_playground': ['park'] // refined by name/description
};

export interface GoogleTypeToPlaceRule {
    type: GooglePlaceType;
    category: PlaceCategorySlug;
}

export const GOOGLE_TYPE_TO_PLACE_CATEGORY: GoogleTypeToPlaceRule[] = [
    { type: 'restaurant', category: 'place.food_restaurant' },
    { type: 'cafe', category: 'place.food_cafe_coffee' },
    { type: 'bakery', category: 'place.food_dessert_bakery' },
    { type: 'bar', category: 'place.bar_pub' },
    { type: 'night_club', category: 'place.nightlife_club' },
    { type: 'movie_theater', category: 'place.culture_cinema' },
    { type: 'museum', category: 'place.culture_museum_gallery' },
    { type: 'art_gallery', category: 'place.culture_museum_gallery' },
    { type: 'zoo', category: 'place.family_zoo_aqua_theme' },
    { type: 'aquarium', category: 'place.family_zoo_aqua_theme' },
    { type: 'amusement_park', category: 'place.family_zoo_aqua_theme' },
    { type: 'bowling_alley', category: 'place.fun_bowling_arcade_escape' },
    { type: 'park', category: 'place.outdoor_park_garden' },
    { type: 'beach', category: 'place.outdoor_beach_waterfront' },
    { type: 'gym', category: 'place.sport_fitness_stadium' },
    { type: 'stadium', category: 'place.sport_fitness_stadium' },
    { type: 'sports_complex', category: 'place.sport_fitness_stadium' },
    { type: 'spa', category: 'place.spa_wellness_sauna' },
    { type: 'shopping_mall', category: 'place.shopping_mall_department' },
    { type: 'department_store', category: 'place.shopping_mall_department' },
    { type: 'tourist_attraction', category: 'place.sight_landmark_historic' },
    { type: 'place_of_worship', category: 'place.sight_religion_worship' }
];

export function mapGooglePrimaryTypeToPlaceCategory(
    primaryType: string
): PlaceCategorySlug | null {
    const rule = GOOGLE_TYPE_TO_PLACE_CATEGORY.find((r) => r.type === primaryType);
    return rule?.category ?? null;
}

/**
 * Retrieves a list of Google Place Types that correspond to the provided place categories.
 * If no place categories are specified, all known place categories are used.
 *
 * @param {readonly PlaceCategorySlug[]} [placeCategories] - An optional array of place category slugs to filter Google Place Types. If omitted, all place categories are considered.
 * @return {GooglePlaceType[]} An array of unique Google Place Types that correspond to the specified or default place categories.
 */
export function getGooglePlaceTypesForPlaceCategories(
    placeCategories?: readonly PlaceCategorySlug[],
): GooglePlaceType[] {
    const usedSlugs: PlaceCategorySlug[] = placeCategories?.length
        ? [...placeCategories]
        : (Object.keys(PLACE_TO_GOOGLE_TYPES) as PlaceCategorySlug[]);

    const seen = new Set<string>();
    const result: GooglePlaceType[] = [];

    for (const slug of usedSlugs) {
        const types = PLACE_TO_GOOGLE_TYPES[slug] ?? [];
        for (const t of types) {
            const key = String(t);
            if (!seen.has(key)) {
                seen.add(key);
                result.push(t);
            }
        }
    }

    return result;
}
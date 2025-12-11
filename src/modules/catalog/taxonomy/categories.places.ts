import type { TaxonomyCategory } from './taxonomy.constants.js';

export type PlaceCategorySlug =
    | 'place.food_restaurant'
    | 'place.food_cafe_coffee'
    | 'place.food_fast_street'
    | 'place.food_dessert_bakery'
    | 'place.bar_pub'
    | 'place.nightlife_club'
    | 'place.culture_museum_gallery'
    | 'place.culture_theatre_venue'
    | 'place.culture_cinema'
    | 'place.family_zoo_aqua_theme'
    | 'place.fun_bowling_arcade_escape'
    | 'place.outdoor_park_garden'
    | 'place.outdoor_nature_hiking'
    | 'place.outdoor_beach_waterfront'
    | 'place.sport_fitness_stadium'
    | 'place.spa_wellness_sauna'
    | 'place.shopping_mall_department'
    | 'place.shopping_market_souvenir'
    | 'place.sight_landmark_historic'
    | 'place.sight_religion_worship'
    | 'place.kids_playground';

export const PLACE_CATEGORIES: TaxonomyCategory[] = [
    {
        slug: 'place.food_restaurant',
        type: 'PLACE',
        name: 'Restaurants',
        expected_duration: 90
    },
    {
        slug: 'place.food_cafe_coffee',
        type: 'PLACE',
        name: 'Cafes & Coffee Shops',
        expected_duration: 60
    },
    {
        slug: 'place.food_fast_street',
        type: 'PLACE',
        name: 'Fast Food & Street Food',
        expected_duration: 30
    },
    {
        slug: 'place.food_dessert_bakery',
        type: 'PLACE',
        name: 'Dessert Places & Bakeries',
        expected_duration: 40
    },
    {
        slug: 'place.bar_pub',
        type: 'PLACE',
        name: 'Bars & Pubs',
        expected_duration: 120
    },
    {
        slug: 'place.nightlife_club',
        type: 'PLACE',
        name: 'Nightclubs',
        expected_duration: 180
    },
    {
        slug: 'place.culture_museum_gallery',
        type: 'PLACE',
        name: 'Museums & Art Galleries',
        expected_duration: 120
    },
    {
        slug: 'place.culture_theatre_venue',
        type: 'PLACE',
        name: 'Theatres & Cultural Venues',
        expected_duration: 60
    },
    {
        slug: 'place.culture_cinema',
        type: 'PLACE',
        name: 'Cinemas',
        expected_duration: 90
    },
    {
        slug: 'place.family_zoo_aqua_theme',
        type: 'PLACE',
        name: 'Zoos, Aquaparks & Theme Parks',
        expected_duration: 240
    },
    {
        slug: 'place.fun_bowling_arcade_escape',
        type: 'PLACE',
        name: 'Bowling, Arcades & Escape Rooms',
        expected_duration: 90
    },
    {
        slug: 'place.outdoor_park_garden',
        type: 'PLACE',
        name: 'Parks & Gardens',
        expected_duration: 90
    },
    {
        slug: 'place.outdoor_nature_hiking',
        type: 'PLACE',
        name: 'Nature & Hiking Spots',
        expected_duration: 240
    },
    {
        slug: 'place.outdoor_beach_waterfront',
        type: 'PLACE',
        name: 'Beaches & Waterfronts',
        expected_duration: 180
    },
    {
        slug: 'place.sport_fitness_stadium',
        type: 'PLACE',
        name: 'Sports & Fitness Venues',
        expected_duration: 90
    },
    {
        slug: 'place.spa_wellness_sauna',
        type: 'PLACE',
        name: 'Spa & Wellness / Saunas',
        expected_duration: 150
    },
    {
        slug: 'place.shopping_mall_department',
        type: 'PLACE',
        name: 'Shopping Malls & Department Stores',
        expected_duration: 120
    },
    {
        slug: 'place.shopping_market_souvenir',
        type: 'PLACE',
        name: 'Markets & Souvenir Shops',
        expected_duration: 90
    },
    {
        slug: 'place.sight_landmark_historic',
        type: 'PLACE',
        name: 'Landmarks & Historic Sites',
        expected_duration: 60
    },
    {
        slug: 'place.sight_religion_worship',
        type: 'PLACE',
        name: 'Religious Sites',
        expected_duration: 40
    },
    {
        slug: 'place.kids_playground',
        type: 'PLACE',
        name: 'Kids Playgrounds & Play Centers',
        expected_duration: 90
    },
    {
        slug: 'place.other',
        type: 'PLACE',
        name: 'Other Places',
        expected_duration: 90
    }
];

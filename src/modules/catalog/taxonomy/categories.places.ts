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
        name: 'Restaurants'
    },
    {
        slug: 'place.food_cafe_coffee',
        type: 'PLACE',
        name: 'Cafes & Coffee'
    },
    {
        slug: 'place.food_fast_street',
        type: 'PLACE',
        name: 'Fast Food & Street Food'
    },
    {
        slug: 'place.food_dessert_bakery',
        type: 'PLACE',
        name: 'Desserts & Bakeries'
    },
    {
        slug: 'place.bar_pub',
        type: 'PLACE',
        name: 'Bars & Pubs'
    },
    {
        slug: 'place.nightlife_club',
        type: 'PLACE',
        name: 'Nightclubs'
    },
    {
        slug: 'place.culture_museum_gallery',
        type: 'PLACE',
        name: 'Museums & Galleries'
    },
    {
        slug: 'place.culture_theatre_venue',
        type: 'PLACE',
        name: 'Theatre & Concert Venues'
    },
    {
        slug: 'place.culture_cinema',
        type: 'PLACE',
        name: 'Cinemas'
    },
    {
        slug: 'place.family_zoo_aqua_theme',
        type: 'PLACE',
        name: 'Zoos, Aquariums & Theme Parks'
    },
    {
        slug: 'place.fun_bowling_arcade_escape',
        type: 'PLACE',
        name: 'Bowling, Arcades & Escape Rooms'
    },
    {
        slug: 'place.outdoor_park_garden',
        type: 'PLACE',
        name: 'Parks & Gardens'
    },
    {
        slug: 'place.outdoor_nature_hiking',
        type: 'PLACE',
        name: 'Nature & Hiking Areas'
    },
    {
        slug: 'place.outdoor_beach_waterfront',
        type: 'PLACE',
        name: 'Beaches & Waterfronts'
    },
    {
        slug: 'place.sport_fitness_stadium',
        type: 'PLACE',
        name: 'Sport & Fitness Venues'
    },
    {
        slug: 'place.spa_wellness_sauna',
        type: 'PLACE',
        name: 'Spa & Wellness'
    },
    {
        slug: 'place.shopping_mall_department',
        type: 'PLACE',
        name: 'Shopping Malls & Department Stores'
    },
    {
        slug: 'place.shopping_market_souvenir',
        type: 'PLACE',
        name: 'Markets & Souvenir Shops'
    },
    {
        slug: 'place.sight_landmark_historic',
        type: 'PLACE',
        name: 'Landmarks & Historic Sites'
    },
    {
        slug: 'place.sight_religion_worship',
        type: 'PLACE',
        name: 'Religious Sites'
    },
    {
        slug: 'place.kids_playground',
        type: 'PLACE',
        name: 'Kids Playgrounds & Play Centers'
    }
];

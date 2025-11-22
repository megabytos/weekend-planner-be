import type { EventCategorySlug } from './categories.events';

// https://docs.predicthq.com/getting-started/predicthq-data/event-categories
export type PredictHQCategory =
    | 'sports'
    | 'conferences'
    | 'expos'
    | 'concerts'
    | 'festivals'
    | 'performing-arts'
    | 'community'
    | 'academic'
    | 'public-holidays'
    | 'school-holidays'
    | 'observances'
    | 'politics'
    | 'daylight-savings'
    | 'airport-delays'
    | 'severe-weather'
    | 'disasters'
    | 'terror'
    | 'health-warnings';

export interface PredictHQCategoryRef {
    category: PredictHQCategory;
}

export const EVENT_TO_PREDICTHQ: Record<EventCategorySlug, PredictHQCategoryRef[]> = {
    'event.concert_show': [{ category: 'concerts' }],

    'event.theatre_performing_arts': [{ category: 'performing-arts' }],

    'event.cinema_screening': [],

    'event.museum_exhibition': [
        { category: 'expos' },
        { category: 'community' }
    ],

    'event.festival_city_event': [
        { category: 'festivals' },
        { category: 'community' },
        { category: 'public-holidays' },
        { category: 'observances' }
    ],

    'event.sport_match_fan': [{ category: 'sports' }],

    'event.sport_race_endurance': [{ category: 'sports' }],

    'event.activity_class': [
        { category: 'sports' },
        { category: 'community' }
    ],

    'event.tour_excursion': [{ category: 'community' }],

    'event.workshop_course': [
        { category: 'academic' },
        { category: 'community' },
        { category: 'conferences' }
    ],

    'event.conference_meetup': [
        { category: 'conferences' },
        { category: 'academic' }
    ],

    'event.community_club_series': [{ category: 'community' }],

    'event.kids_family': [
        { category: 'community' },
        { category: 'school-holidays' }
    ],

    'event.nightlife_party': [
        { category: 'concerts' },
        { category: 'community' }
    ],

    'event.online_event': [],

    'event.other': []
};

export interface PredictHQToOurRule {
    category: PredictHQCategory;
    our: EventCategorySlug;
}

export const PREDICTHQ_TO_EVENT_CATEGORY: PredictHQToOurRule[] = [
    { category: 'concerts', our: 'event.concert_show' },
    { category: 'performing-arts', our: 'event.theatre_performing_arts' },
    { category: 'sports', our: 'event.sport_match_fan' },
    { category: 'festivals', our: 'event.festival_city_event' },
    { category: 'community', our: 'event.community_club_series' },
    { category: 'conferences', our: 'event.conference_meetup' },
    { category: 'expos', our: 'event.museum_exhibition' },
    { category: 'academic', our: 'event.workshop_course' },
    { category: 'school-holidays', our: 'event.kids_family' },
    { category: 'public-holidays', our: 'event.festival_city_event' },
    { category: 'observances', our: 'event.festival_city_event' },

    { category: 'politics', our: 'event.other' },
    { category: 'daylight-savings', our: 'event.other' },
    { category: 'airport-delays', our: 'event.other' },
    { category: 'severe-weather', our: 'event.other' },
    { category: 'disasters', our: 'event.other' },
    { category: 'terror', our: 'event.other' },
    { category: 'health-warnings', our: 'event.other' }
];

export function mapPredictHQCategoryToEventCategory(
    category: string
): EventCategorySlug | null {
    const rule = PREDICTHQ_TO_EVENT_CATEGORY.find((r) => r.category === category);
    return rule?.our ?? null;
}

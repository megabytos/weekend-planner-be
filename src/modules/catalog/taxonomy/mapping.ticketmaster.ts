import type { EventCategorySlug } from './categories.events.js';

export type TicketmasterSegmentName =
    | 'Music'
    | 'Sports'
    | 'Arts & Theatre'
    | 'Film'
    | 'Miscellaneous'
    | 'Undefined';

export interface TicketmasterCategoryRef {
    segment: TicketmasterSegmentName;
    genre?: string;
    subGenre?: string;
}

/**
 * Direct mapping: our event category -> Ticketmaster classifications
 */
export const EVENT_TO_TICKETMASTER: Record<EventCategorySlug, TicketmasterCategoryRef[]> = {
    'event.concert_show': [
        { segment: 'Music' },
        { segment: 'Arts & Theatre', genre: 'Music' },
        { segment: 'Miscellaneous', genre: 'Comedy' }
    ],

    'event.theatre_performing_arts': [
        { segment: 'Arts & Theatre' }
    ],

    'event.cinema_screening': [
        { segment: 'Film' }
    ],

    'event.museum_exhibition': [
        { segment: 'Arts & Theatre', genre: 'Fine Art' },
        { segment: 'Miscellaneous', genre: 'Hobby/Special Interest Expos' }
    ],

    'event.festival_city_event': [
        { segment: 'Miscellaneous', genre: 'Fairs & Festivals' },
        { segment: 'Miscellaneous', genre: 'Holiday' },
        { segment: 'Miscellaneous', genre: 'Community/Civic' }
    ],

    'event.sport_match_fan': [
        { segment: 'Sports' }
    ],

    'event.sport_race_endurance': [
        { segment: 'Sports', genre: 'Athletic Races' }
    ],

    'event.activity_class': [
        { segment: 'Miscellaneous', genre: 'Health/Wellness' },
        { segment: 'Miscellaneous', genre: 'Special Interest/Hobby' }
    ],

    'event.tour_excursion': [
        { segment: 'Miscellaneous', genre: 'Community/Civic' }
    ],

    'event.workshop_course': [
        { segment: 'Miscellaneous', genre: 'Lecture/Seminar' },
        { segment: 'Miscellaneous', genre: 'Special Interest/Hobby' }
    ],

    'event.conference_meetup': [
        { segment: 'Miscellaneous', genre: 'Lecture/Seminar' },
        { segment: 'Miscellaneous', genre: 'Convention' },
        { segment: 'Miscellaneous', genre: 'Community/Civic' }
    ],

    'event.community_club_series': [
        { segment: 'Miscellaneous', genre: 'Community/Civic' }
    ],

    'event.kids_family': [
        { segment: 'Miscellaneous', genre: 'Family' },
        { segment: 'Arts & Theatre', genre: "Children's Theatre" }
    ],

    'event.nightlife_party': [
        { segment: 'Music', genre: 'Dance/Electronic' }
    ],

    'event.online_event': [
        // Online is determined by venue / URL, there is no separate segment
    ],

    'event.other': [
        { segment: 'Undefined' }
    ]
};

export interface TicketmasterToOurRule {
    segment: TicketmasterSegmentName;
    genre?: string;
    subGenre?: string;
    category: EventCategorySlug;
}

export const TICKETMASTER_TO_EVENT_CATEGORY: TicketmasterToOurRule[] = [
    { segment: 'Music', genre: 'Dance/Electronic', category: 'event.nightlife_party' },
    { segment: 'Music', category: 'event.concert_show' },

    { segment: 'Sports', genre: 'Athletic Races', category: 'event.sport_race_endurance' },
    { segment: 'Sports', category: 'event.sport_match_fan' },

    { segment: 'Film', category: 'event.cinema_screening' },

    { segment: 'Arts & Theatre', genre: "Children's Theatre", category: 'event.kids_family' },
    { segment: 'Arts & Theatre', genre: 'Fine Art', category: 'event.museum_exhibition' },
    { segment: 'Arts & Theatre', genre: 'Music', category: 'event.concert_show' },
    { segment: 'Arts & Theatre', category: 'event.theatre_performing_arts' },

    { segment: 'Miscellaneous', genre: 'Fairs & Festivals', category: 'event.festival_city_event' },
    { segment: 'Miscellaneous', genre: 'Holiday', category: 'event.festival_city_event' },
    { segment: 'Miscellaneous', genre: 'Family', category: 'event.kids_family' },
    { segment: 'Miscellaneous', genre: 'Comedy', category: 'event.concert_show' },
    { segment: 'Miscellaneous', genre: 'Lecture/Seminar', category: 'event.workshop_course' },
    { segment: 'Miscellaneous', genre: 'Hobby/Special Interest Expos', category: 'event.museum_exhibition' },
    { segment: 'Miscellaneous', genre: 'Community/Civic', category: 'event.community_club_series' },
    { segment: 'Miscellaneous', genre: 'Health/Wellness', category: 'event.activity_class' },

    { segment: 'Undefined', category: 'event.other' },
    { segment: 'Miscellaneous', category: 'event.other' }
];

export function mapTicketmasterClassificationToEventCategory(
    classification: {
        segment?: { name?: string };
        genre?: { name?: string };
        subGenre?: { name?: string };
    }
): EventCategorySlug | null {
    const segName = classification.segment?.name as TicketmasterSegmentName | undefined;
    const genreName = classification.genre?.name;
    const subGenreName = classification.subGenre?.name;

    if (!segName) return null;

    for (const rule of TICKETMASTER_TO_EVENT_CATEGORY) {
        if (rule.segment !== segName) continue;
        if (rule.genre && rule.genre !== genreName) continue;
        if (rule.subGenre && rule.subGenre !== subGenreName) continue;
        return rule.category;
    }

    return null;
}

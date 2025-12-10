import type { TaxonomyCategory } from './taxonomy.constants.js';

export type EventCategorySlug =
    | 'event.concert_show'
    | 'event.theatre_performing_arts'
    | 'event.cinema_screening'
    | 'event.museum_exhibition'
    | 'event.festival_city_event'
    | 'event.sport_match_fan'
    | 'event.sport_race_endurance'
    | 'event.activity_class'
    | 'event.tour_excursion'
    | 'event.workshop_course'
    | 'event.conference_meetup'
    | 'event.community_club_series'
    | 'event.kids_family'
    | 'event.nightlife_party'
    | 'event.online_event'
    | 'event.other';

export const EVENT_CATEGORIES: TaxonomyCategory[] = [
    {
        slug: 'event.concert_show',
        type: 'EVENT',
        name: 'Concerts & Shows',
        expected_duration: 120
    },
    {
        slug: 'event.theatre_performing_arts',
        type: 'EVENT',
        name: 'Theatre & Performing Arts',
        expected_duration: 150
    },
    {
        slug: 'event.cinema_screening',
        type: 'EVENT',
        name: 'Cinema & Screenings',
        expected_duration: 120
    },
    {
        slug: 'event.museum_exhibition',
        type: 'EVENT',
        name: 'Museum Exhibitions & Openings',
        expected_duration: 90
    },
    {
        slug: 'event.festival_city_event',
        type: 'EVENT',
        name: 'Festivals & City Events',
        expected_duration: 240
    },
    {
        slug: 'event.sport_match_fan',
        type: 'EVENT',
        name: 'Sports Matches & Fan Events',
        expected_duration: 150
    },
    {
        slug: 'event.sport_race_endurance',
        type: 'EVENT',
        name: 'Races & Endurance Events',
        expected_duration: 240
    },
    {
        slug: 'event.activity_class',
        type: 'EVENT',
        name: 'Classes & Activities',
        expected_duration: 90
    },
    {
        slug: 'event.tour_excursion',
        type: 'EVENT',
        name: 'Tours & Excursions',
        expected_duration: 120
    },
    {
        slug: 'event.workshop_course',
        type: 'EVENT',
        name: 'Workshops & Short Courses',
        expected_duration: 180
    },
    {
        slug: 'event.conference_meetup',
        type: 'EVENT',
        name: 'Conferences & Meetups',
        expected_duration: 240
    },
    {
        slug: 'event.community_club_series',
        type: 'EVENT',
        name: 'Community & Club Events',
        expected_duration: 120
    },
    {
        slug: 'event.kids_family',
        type: 'EVENT',
        name: 'Kids & Family Events',
        expected_duration: 90
    },
    {
        slug: 'event.nightlife_party',
        type: 'EVENT',
        name: 'Nightlife & Parties',
        expected_duration: 240
    },
    {
        slug: 'event.online_event',
        type: 'EVENT',
        name: 'Online Events',
        expected_duration: 90
    },
    {
        slug: 'event.other',
        type: 'EVENT',
        name: 'Other Events',
        expected_duration: 120
    }
];

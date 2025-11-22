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
        name: 'Concerts & Shows'
    },
    {
        slug: 'event.theatre_performing_arts',
        type: 'EVENT',
        name: 'Theatre & Performing Arts'
    },
    {
        slug: 'event.cinema_screening',
        type: 'EVENT',
        name: 'Cinema & Screenings'
    },
    {
        slug: 'event.museum_exhibition',
        type: 'EVENT',
        name: 'Exhibitions & Museum Events'
    },
    {
        slug: 'event.festival_city_event',
        type: 'EVENT',
        name: 'Festivals & City Events'
    },
    {
        slug: 'event.sport_match_fan',
        type: 'EVENT',
        name: 'Sport Matches & Fan Events'
    },
    {
        slug: 'event.sport_race_endurance',
        type: 'EVENT',
        name: 'Races & Endurance Events'
    },
    {
        slug: 'event.activity_class',
        type: 'EVENT',
        name: 'Activity Classes (Yoga, Dance, etc.)'
    },
    {
        slug: 'event.tour_excursion',
        type: 'EVENT',
        name: 'Tours & Excursions'
    },
    {
        slug: 'event.workshop_course',
        type: 'EVENT',
        name: 'Workshops & Short Courses'
    },
    {
        slug: 'event.conference_meetup',
        type: 'EVENT',
        name: 'Conferences & Meetups'
    },
    {
        slug: 'event.community_club_series',
        type: 'EVENT',
        name: 'Community Clubs & Series'
    },
    {
        slug: 'event.kids_family',
        type: 'EVENT',
        name: 'Kids & Family Events'
    },
    {
        slug: 'event.nightlife_party',
        type: 'EVENT',
        name: 'Nightlife & Parties'
    },
    {
        slug: 'event.online_event',
        type: 'EVENT',
        name: 'Online Events'
    },
    {
        slug: 'event.other',
        type: 'EVENT',
        name: 'Other Events'
    }
];

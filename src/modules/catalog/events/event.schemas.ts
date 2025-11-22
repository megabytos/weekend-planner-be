import { z } from 'zod';

export const EventIdParamSchema = z.object({
    id: z.string().uuid()
});

export const EventSchema = z.object({
    title: z.string().min(1),
    categoryId: z.string().uuid(),
    venueId: z.string().uuid().optional(), // link to Place
    cityCode: z.string().min(2).max(10),
    // series-level data
    isOnline: z.boolean().default(false),
    // occurrence-level simplified (we will extend when designing full model)
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime().optional(),
    priceMin: z.number().nonnegative().optional(),
    priceMax: z.number().nonnegative().optional(),
    currency: z.string().min(1).max(3).default('UAH'),
    source: z.enum(['TICKETMASTER', 'PREDICTHQ', 'PARTNER', 'MANUAL', 'OTHER']).default('OTHER')
});

export type CreateEventInput = z.infer<typeof EventSchema>;

export const EventListResponseSchema = z.object({ items: z.array(EventSchema) });
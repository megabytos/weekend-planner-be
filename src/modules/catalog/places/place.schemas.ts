import { z } from 'zod';

export const PlaceIdParamSchema = z.object({
    id: z.string().uuid()
});

export const PlaceSchema = z.object({
    name: z.string().min(1),
    categoryId: z.uuid(),
    cityCode: z.string().min(2).max(10),
    address: z.string().min(1),
    geo: z.object({
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180)
    }),
    priceTier: z.enum(['FREE', 'CHEAP', 'MODERATE', 'EXPENSIVE']).optional(),
    tags: z.array(z.string()).optional(),
    source: z.enum(['PARTNER', 'API', 'MANUAL']).default('MANUAL')
});

export type CreatePlaceInput = z.infer<typeof PlaceSchema>;

export const PlaceListResponseSchema = z.object({ items: z.array(PlaceSchema) });

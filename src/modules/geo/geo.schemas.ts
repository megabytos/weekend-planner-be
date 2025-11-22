import { z } from 'zod';

export const geoCoordinatesSchema = z.object({
    lat: z.number(),
    lon: z.number()
});

export const geoBoundingBoxSchema = z.object({
    minLat: z.number(),
    minLon: z.number(),
    maxLat: z.number(),
    maxLon: z.number()
});

export const geoCitySchema = z.object({
    id: z.number(),
    name: z.string(),
    countryCode: z.string().length(2),
    countryName: z.string(),
    codeIATA: z.string().nullable().optional(),
    coordinates: geoCoordinatesSchema,
    boundingBox: geoBoundingBoxSchema
});

export const geoCitiesQuerySchema = z.object({
    q: z.string().optional().describe('search by name (substring)'),
    countryCode: z.string().length(2).optional()
});

export const geoCitiesResponseSchema = z.object({
    items: z.array(geoCitySchema)
});

export const geoCityParamsSchema = z.object({
    id: z.coerce.number()
});

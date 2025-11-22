import { z } from 'zod';

export const taxonomyCategoryTypeSchema = z.enum(['EVENT', 'PLACE', 'TAG']);

export const taxonomyCategorySchema = z.object({
    name: z.string(),
    slug: z.string(),
    type: taxonomyCategoryTypeSchema,
});

export const taxonomyCategoriesQuerySchema = z.object({
    // optional: can be filtered by type
    type: taxonomyCategoryTypeSchema.optional()
});

export const taxonomyCategoriesResponseSchema = z.object({
    items: z.array(taxonomyCategorySchema)
});

// DTO types for future use (can be used in routes/services)
export type TaxonomyCategoryTypeDto = z.infer<typeof taxonomyCategoryTypeSchema>;
export type TaxonomyCategoryDto = z.infer<typeof taxonomyCategorySchema>;
export type TaxonomyCategoriesQueryDto = z.infer<typeof taxonomyCategoriesQuerySchema>;
export type TaxonomyCategoriesResponseDto = z.infer<typeof taxonomyCategoriesResponseSchema>;

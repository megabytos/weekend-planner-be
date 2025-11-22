import {
    TAXONOMY_CATEGORIES,
    EVENT_CATEGORIES,
    PLACE_CATEGORIES,
    type TaxonomyCategory,
    type TaxonomyCategoryType
} from './taxonomy.constants';

export class TaxonomyService {
    listCategories(params?: {
        type?: TaxonomyCategoryType | TaxonomyCategoryType[];
    }): TaxonomyCategory[] {
        if (!params?.type) {
            return TAXONOMY_CATEGORIES;
        }

        const types = Array.isArray(params.type) ? params.type : [params.type];
        return TAXONOMY_CATEGORIES.filter((c) => types.includes(c.type));
    }

    listEventCategories(): TaxonomyCategory[] {
        return EVENT_CATEGORIES;
    }

    listPlaceCategories(): TaxonomyCategory[] {
        return PLACE_CATEGORIES;
    }

    /**
     * Try to map raw slugs or names (from user / providers) to our taxonomy.
     * Accepts array of candidates (e.g. ["concert", "music"]).
     */
    mapCategoryToTaxonomy(
        slugsOrNames: string[]
    ): { slug: string; type: TaxonomyCategoryType; name: string } | null {
        if (!slugsOrNames?.length) return null;

        const lower = slugsOrNames.map((s) => String(s).toLowerCase().trim());

        const match = TAXONOMY_CATEGORIES.find((c) =>
            lower.some((x) => {
                const slug = c.slug.toLowerCase();
                const name = c.name.toLowerCase();
                return slug === x || name.includes(x) || x.includes(name);
            })
        );

        return match ? { slug: match.slug, type: match.type, name: match.name } : null;
    }
}

// For compatibility: functional helper without explicit service instance
export function mapCategoryToTaxonomy(
    slugsOrNames: string[]
): { slug: string; type: TaxonomyCategoryType; name: string } | null {
    const service = new TaxonomyService();
    return service.mapCategoryToTaxonomy(slugsOrNames);
}

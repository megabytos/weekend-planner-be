import type { PrismaClient } from '@prisma/client';
import type { CreatePlaceInput } from './place.schemas';

export async function listPlaces() {
    return { items: [] };
}

export class PlaceService {
    constructor(private readonly prisma: PrismaClient) {}

    // Later we may add transaction and deduplication logic here
    async createPlace(data: CreatePlaceInput) {
        return this.prisma.place.create({
            data: {
                name: data.name,
                mainCategoryId: data.categoryId,
                cityId: data.cityCode,
                address: data.address,
                lat: data.geo.lat,
                lng: data.geo.lon,
                priceTier: data.priceTier,
                //tags: data.tags,
                //source: data.source
            }
        });
    }

    async getPlaceById(id: string) {
        return this.prisma.place.findUnique({ where: { id } });
    }
}

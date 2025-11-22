import type { PrismaClient } from '@prisma/client';
import type { CreateEventInput } from './event.schemas';

export async function listEvents() {
    return { items: [] };
}

export class EventService {
    constructor(private readonly prisma: PrismaClient) {}

    async createEvent(data: CreateEventInput) {
        // Later we will split series/occurrence tables and adjust mapping
        return this.prisma.event.create({
            data: {
                title: data.title,
                mainCategoryId: data.categoryId,
                //venueId: data.venueId,
                cityId: data.cityCode,
                //isOnline: data.isOnline,
                //startsAt: new Date(data.startsAt),
                //endsAt: data.endsAt ? new Date(data.endsAt) : null,
                //priceMin: data.priceMin ?? null,
                //priceMax: data.priceMax ?? null,
                //currency: data.currency,
                //sources: data.source
            }
        });
    }

    async getEventById(id: string) {
        return this.prisma.event.findUnique({ where: { id } });
    }
}

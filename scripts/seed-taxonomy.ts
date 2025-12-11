import { PrismaClient, CategoryScope } from '@prisma/client';
import { EVENT_CATEGORIES } from '../src/modules/catalog/taxonomy/categories.events.js';
import { PLACE_CATEGORIES } from '../src/modules/catalog/taxonomy/categories.places.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding taxonomy: EventCategory, PlaceCategory');

  await prisma.$transaction(async (tx) => {
    // Detach main categories to avoid FK violations
    await tx.place.updateMany({ data: { mainCategoryId: null } });
    await tx.event.updateMany({ data: { mainCategoryId: null } });

    // Clear M:N join tables first
    await tx.placeToCategory.deleteMany({});
    await tx.eventToCategory.deleteMany({});

    // Clear category tables
    await tx.placeCategory.deleteMany({});
    await tx.eventCategory.deleteMany({});

    // Insert place categories
    for (const c of PLACE_CATEGORIES) {
      await tx.placeCategory.create({
        data: {
          // Set primary key equal to slug as requested
          id: c.slug,
          key: c.slug,
          title: c.name,
          scope: CategoryScope.PLACE,
          expectedDuration: c.expected_duration ?? null,
        },
      });
    }

    // Insert event categories
    for (const c of EVENT_CATEGORIES) {
      await tx.eventCategory.create({
        data: {
          // Set primary key equal to slug as requested
          id: c.slug,
          key: c.slug,
          title: c.name,
          scope: CategoryScope.EVENT,
          expectedDuration: c.expected_duration ?? null,
        },
      });
    }
  });

  console.log('Taxonomy seeding completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

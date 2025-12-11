import { PrismaClient } from '@prisma/client';
import { GEO_CITIES } from '../src/modules/geo/geo.constants.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding geography: City');

  await prisma.$transaction(async (tx) => {
    // Clear dependent relations first if needed (Places/Events reference City)
    // For hard reset we require manual cleanup or rely on ON DELETE RESTRICT.
    // Here we just delete cities when no FKs exist yet in fresh DB.

    // Attempt a safe delete; if FKs exist, recommend resetting via prisma migrate reset.
    await tx.city.deleteMany({});

    for (const c of GEO_CITIES) {
      await tx.city.create({
        data: {
          // Use the same id as in GEO_CITIES (stored as string in DB)
          id: String(c.id),
          name: c.name,
          country: c.countryName,
          countryCode: c.countryCode,
          codeIATA: c.codeIATA ?? null,
          lat: c.coordinates.lat,
          lng: c.coordinates.lon,
          minLat: c.boundingBox?.minLat ?? null,
          minLng: c.boundingBox?.minLon ?? null,
          maxLat: c.boundingBox?.maxLat ?? null,
          maxLng: c.boundingBox?.maxLon ?? null,
          tz: 'UTC',
        },
      });
    }
  });

  console.log('Geo seeding completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

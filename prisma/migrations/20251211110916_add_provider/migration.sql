-- AlterTable
ALTER TABLE "City" ADD COLUMN     "codeIATA" TEXT,
ADD COLUMN     "countryCode" TEXT,
ADD COLUMN     "maxLat" DECIMAL(10,7),
ADD COLUMN     "maxLng" DECIMAL(10,7),
ADD COLUMN     "minLat" DECIMAL(10,7),
ADD COLUMN     "minLng" DECIMAL(10,7);

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "provider" "SourceType",
ADD COLUMN     "providerCategories" TEXT;

-- AlterTable
ALTER TABLE "EventCategory" ADD COLUMN     "expectedDuration" INTEGER;

-- AlterTable
ALTER TABLE "Place" ADD COLUMN     "provider" "SourceType",
ADD COLUMN     "providerCategories" TEXT;

-- AlterTable
ALTER TABLE "PlaceCategory" ADD COLUMN     "expectedDuration" INTEGER;

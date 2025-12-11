-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "ageLimit" INTEGER,
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "isOnline" BOOLEAN,
ADD COLUMN     "languages" TEXT[],
ADD COLUMN     "priceFrom" DOUBLE PRECISION,
ADD COLUMN     "priceTo" DOUBLE PRECISION,
ADD COLUMN     "ticketsUrl" TEXT;

-- AlterTable
ALTER TABLE "Place" ADD COLUMN     "url" TEXT;

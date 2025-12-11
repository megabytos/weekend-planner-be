/*
  Warnings:

  - You are about to drop the column `date` on the `Plan` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[shareCode]` on the table `Plan` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `type` to the `PlanItem` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TransportMode" AS ENUM ('WALK', 'PUBLIC', 'CAR', 'BIKE');

-- DropForeignKey
ALTER TABLE "PlanItem" DROP CONSTRAINT "PlanItem_planId_fkey";

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "freshnessScore" DOUBLE PRECISION,
ADD COLUMN     "popularityScore" DOUBLE PRECISION,
ADD COLUMN     "qualityScore" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "EventSource" ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "sourceUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Place" ADD COLUMN     "freshnessScore" DOUBLE PRECISION,
ADD COLUMN     "popularityScore" DOUBLE PRECISION,
ADD COLUMN     "qualityScore" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "PlaceSource" ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "sourceUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Plan" DROP COLUMN "date",
ADD COLUMN     "dateFrom" TIMESTAMP(3),
ADD COLUMN     "dateTo" TIMESTAMP(3),
ADD COLUMN     "shareCode" TEXT,
ADD COLUMN     "transportMode" "TransportMode";

-- AlterTable
ALTER TABLE "PlanItem" ADD COLUMN     "type" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Plan_shareCode_key" ON "Plan"("shareCode");

-- CreateIndex
CREATE INDEX "Plan_userId_idx" ON "Plan"("userId");

-- AddForeignKey
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

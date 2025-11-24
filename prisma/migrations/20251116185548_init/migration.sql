-- CreateEnum
CREATE TYPE "CategoryScope" AS ENUM ('PLACE', 'EVENT');

-- CreateEnum
CREATE TYPE "PriceTier" AS ENUM ('FREE', 'CHEAP', 'MODERATE', 'EXPENSIVE', 'ANY');

-- CreateEnum
CREATE TYPE "CompanyType" AS ENUM ('KIDS', 'COUPLE', 'SOLO', 'FRIENDS', 'COLLEAGUES');

-- CreateEnum
CREATE TYPE "VenueType" AS ENUM ('INDOOR', 'OUTDOOR', 'ANY');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('TICKETMASTER', 'PREDICTHQ', 'GEOAPIFY', 'GOOGLE_PLACES', 'FOURSQUARE', 'MANUAL', 'PARTNER');

-- CreateEnum
CREATE TYPE "ImportKind" AS ENUM ('CSV', 'ICS', 'API');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cityId" TEXT,
    "homeLat" DECIMAL(10,7),
    "homeLng" DECIMAL(10,7),
    "budget" "PriceTier",
    "preferredMode" "CompanyType",
    "tags" TEXT[],
    "preferences" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeoRegion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeoRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "regionId" TEXT,
    "lat" DECIMAL(10,7) NOT NULL,
    "lng" DECIMAL(10,7) NOT NULL,
    "tz" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaceCategory" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "parentId" TEXT,
    "scope" "CategoryScope" NOT NULL DEFAULT 'PLACE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventCategory" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "parentId" TEXT,
    "scope" "CategoryScope" NOT NULL DEFAULT 'EVENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Place" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "mainCategoryId" TEXT,
    "lat" DECIMAL(10,7) NOT NULL,
    "lng" DECIMAL(10,7) NOT NULL,
    "address" TEXT,
    "venueType" "VenueType",
    "priceTier" "PriceTier",
    "openingHours" JSONB,
    "attributes" JSONB,
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "moderation" "ModerationStatus" NOT NULL DEFAULT 'APPROVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "mainCategoryId" TEXT,
    "venueType" "VenueType",
    "priceTier" "PriceTier",
    "attributes" JSONB,
    "imageUrl" TEXT,
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "moderation" "ModerationStatus" NOT NULL DEFAULT 'APPROVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventOccurrence" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "placeId" TEXT,
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "timezone" TEXT,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaceToCategory" (
    "placeId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PlaceToCategory_pkey" PRIMARY KEY ("placeId","categoryId")
);

-- CreateTable
CREATE TABLE "EventToCategory" (
    "eventId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EventToCategory_pkey" PRIMARY KEY ("eventId","categoryId")
);

-- CreateTable
CREATE TABLE "PlaceSource" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "source" "SourceType" NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT,
    "payload" JSONB,
    "fetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaceSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSource" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "source" "SourceType" NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT,
    "payload" JSONB,
    "fetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cityId" TEXT,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "placeId" TEXT,
    "occurrenceId" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),

    CONSTRAINT "PlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "placeId" TEXT,
    "eventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "placeId" TEXT,
    "eventId" TEXT,
    "rating" INTEGER NOT NULL,
    "text" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "ModerationStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactEmail" TEXT,
    "cityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT,
    "kind" "ImportKind" NOT NULL,
    "source" "SourceType",
    "url" TEXT,
    "payload" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "log" JSONB,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationEntry" (
    "id" TEXT NOT NULL,
    "status" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "notes" TEXT,
    "placeId" TEXT,
    "eventId" TEXT,
    "reviewId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ModerationEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationSignal" (
    "id" TEXT NOT NULL,
    "placeId" TEXT,
    "eventId" TEXT,
    "signals" JSONB NOT NULL,
    "score" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendationSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GeoRegion_code_key" ON "GeoRegion"("code");

-- CreateIndex
CREATE INDEX "City_name_idx" ON "City"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PlaceCategory_key_key" ON "PlaceCategory"("key");

-- CreateIndex
CREATE UNIQUE INDEX "EventCategory_key_key" ON "EventCategory"("key");

-- CreateIndex
CREATE INDEX "Place_cityId_idx" ON "Place"("cityId");

-- CreateIndex
CREATE INDEX "Place_lat_lng_idx" ON "Place"("lat", "lng");

-- CreateIndex
CREATE INDEX "Place_mainCategoryId_idx" ON "Place"("mainCategoryId");

-- CreateIndex
CREATE INDEX "Event_cityId_idx" ON "Event"("cityId");

-- CreateIndex
CREATE INDEX "Event_mainCategoryId_idx" ON "Event"("mainCategoryId");

-- CreateIndex
CREATE INDEX "EventOccurrence_eventId_idx" ON "EventOccurrence"("eventId");

-- CreateIndex
CREATE INDEX "EventOccurrence_placeId_idx" ON "EventOccurrence"("placeId");

-- CreateIndex
CREATE INDEX "EventOccurrence_startTime_idx" ON "EventOccurrence"("startTime");

-- CreateIndex
CREATE INDEX "EventOccurrence_lat_lng_idx" ON "EventOccurrence"("lat", "lng");

-- CreateIndex
CREATE INDEX "PlaceSource_placeId_idx" ON "PlaceSource"("placeId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaceSource_source_externalId_key" ON "PlaceSource"("source", "externalId");

-- CreateIndex
CREATE INDEX "EventSource_eventId_idx" ON "EventSource"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventSource_source_externalId_key" ON "EventSource"("source", "externalId");

-- CreateIndex
CREATE INDEX "PlanItem_planId_idx" ON "PlanItem"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_fav_place" ON "Favorite"("userId", "placeId");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_fav_event" ON "Favorite"("userId", "eventId");

-- CreateIndex
CREATE INDEX "Review_placeId_idx" ON "Review"("placeId");

-- CreateIndex
CREATE INDEX "Review_eventId_idx" ON "Review"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_signal_place" ON "RecommendationSignal"("placeId");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_signal_event" ON "RecommendationSignal"("eventId");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "City" ADD CONSTRAINT "City_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "GeoRegion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceCategory" ADD CONSTRAINT "PlaceCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PlaceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCategory" ADD CONSTRAINT "EventCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "EventCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Place" ADD CONSTRAINT "Place_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Place" ADD CONSTRAINT "Place_mainCategoryId_fkey" FOREIGN KEY ("mainCategoryId") REFERENCES "PlaceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_mainCategoryId_fkey" FOREIGN KEY ("mainCategoryId") REFERENCES "EventCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventOccurrence" ADD CONSTRAINT "EventOccurrence_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventOccurrence" ADD CONSTRAINT "EventOccurrence_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceToCategory" ADD CONSTRAINT "PlaceToCategory_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceToCategory" ADD CONSTRAINT "PlaceToCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PlaceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventToCategory" ADD CONSTRAINT "EventToCategory_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventToCategory" ADD CONSTRAINT "EventToCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "EventCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceSource" ADD CONSTRAINT "PlaceSource_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSource" ADD CONSTRAINT "EventSource_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "EventOccurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationEntry" ADD CONSTRAINT "ModerationEntry_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationEntry" ADD CONSTRAINT "ModerationEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationEntry" ADD CONSTRAINT "ModerationEntry_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationSignal" ADD CONSTRAINT "RecommendationSignal_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationSignal" ADD CONSTRAINT "RecommendationSignal_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

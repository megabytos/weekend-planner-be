/*
  Warnings:

  - Added the required column `passwordHash` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'PARTNER', 'USER');

-- AlterTable
ALTER TABLE "Place" ADD COLUMN     "tags" TEXT[];

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordHash" TEXT NOT NULL,
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'USER';

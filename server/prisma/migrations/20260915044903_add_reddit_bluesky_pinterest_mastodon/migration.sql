-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Platform" ADD VALUE 'REDDIT';
ALTER TYPE "Platform" ADD VALUE 'BLUESKY';
ALTER TYPE "Platform" ADD VALUE 'PINTEREST';
ALTER TYPE "Platform" ADD VALUE 'MASTODON';

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "trialEndsAt" SET DEFAULT (now() + interval '3 days');
